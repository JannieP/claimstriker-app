import { Job } from 'bullmq';
import { prisma } from '../config/database.js';
import { decrypt } from '../lib/encryption.js';
import {
  getContentOwner,
  searchClaims,
  getAsset,
  parseMatchInfo,
  parsePolicyAction,
  ContentIdClaim,
} from '../lib/youtube/contentId.js';
import { notificationQueue } from './queue.js';
import type { NotificationJob } from './queue.js';

export interface ClaimSyncJob {
  channelId: string;
  fullSync?: boolean; // If true, fetch all claims; otherwise just recent
}

/**
 * Sync claims from YouTube Content ID API for a channel.
 * This fetches real claim data using the Partner API.
 */
export async function processClaimSync(job: Job<ClaimSyncJob>) {
  const { channelId, fullSync = false } = job.data;

  console.log(`[ClaimSync] Starting claim sync for channel ${channelId} (fullSync: ${fullSync})`);

  // Get channel from database
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    include: {
      videos: {
        select: {
          id: true,
          youtubeVideoId: true,
          title: true,
        },
      },
    },
  });

  if (!channel) {
    console.log(`[ClaimSync] Channel ${channelId} not found`);
    return;
  }

  if (channel.status !== 'ACTIVE') {
    console.log(`[ClaimSync] Channel ${channelId} is not active, skipping`);
    return;
  }

  try {
    const accessToken = decrypt(channel.accessToken);

    // Get or fetch content owner ID
    let contentOwnerId = channel.contentOwnerId;

    if (!contentOwnerId) {
      console.log(`[ClaimSync] Fetching content owner ID for channel ${channelId}`);
      const contentOwner = await getContentOwner(accessToken);

      if (!contentOwner) {
        console.log(`[ClaimSync] No content owner found for channel ${channelId} - may not have partner access`);
        await prisma.channel.update({
          where: { id: channelId },
          data: {
            lastSyncError: 'No Content ID access - partner API not available for this account',
          },
        });
        return;
      }

      contentOwnerId = contentOwner.id;

      // Store the content owner ID for future use
      await prisma.channel.update({
        where: { id: channelId },
        data: { contentOwnerId },
      });

      console.log(`[ClaimSync] Found content owner: ${contentOwner.displayName} (${contentOwnerId})`);
    }

    // Build map of our video IDs
    const videoIdMap = new Map<string, { id: string; title: string }>();
    for (const video of channel.videos) {
      videoIdMap.set(video.youtubeVideoId, { id: video.id, title: video.title });
    }

    // Determine date range for claim search
    const createdAfter = fullSync
      ? undefined
      : channel.lastClaimSyncAt || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Last 30 days

    // Fetch claims from Content ID API
    console.log(`[ClaimSync] Searching for claims...`);
    let pageToken: string | undefined;
    let totalClaims = 0;
    let newClaims = 0;
    let updatedClaims = 0;

    do {
      const result = await searchClaims(accessToken, contentOwnerId, {
        videoIds: Array.from(videoIdMap.keys()),
        createdAfter,
        pageToken,
        includeThirdPartyClaims: true,
      });

      for (const claim of result.items) {
        totalClaims++;

        // Check if this video is in our database
        const videoInfo = videoIdMap.get(claim.videoId);
        if (!videoInfo) {
          continue; // Skip claims for videos we don't have
        }

        // Process the claim
        const processed = await processContentIdClaim(
          claim,
          videoInfo.id,
          channel.userId
        );

        if (processed === 'new') {
          newClaims++;
        } else if (processed === 'updated') {
          updatedClaims++;
        }
      }

      pageToken = result.nextPageToken;

      // Rate limiting
      if (pageToken) {
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    } while (pageToken);

    // Update last claim sync time
    await prisma.channel.update({
      where: { id: channelId },
      data: {
        lastClaimSyncAt: new Date(),
        lastSyncError: null,
      },
    });

    console.log(
      `[ClaimSync] Completed for channel ${channelId}: ` +
        `${totalClaims} claims processed, ${newClaims} new, ${updatedClaims} updated`
    );

    // Notify user if new claims were found
    if (newClaims > 0) {
      await notificationQueue.add('notify', {
        userId: channel.userId,
        type: 'NEW_CLAIM',
        title: `${newClaims} New Claim${newClaims > 1 ? 's' : ''} Detected`,
        message: `Found ${newClaims} new copyright claim${newClaims > 1 ? 's' : ''} on your videos.`,
        channelId,
        sendEmail: true,
      } as NotificationJob);
    }
  } catch (error: any) {
    console.error(`[ClaimSync] Error syncing claims for channel ${channelId}:`, error.message);

    // Check if it's a permission error
    if (error.message?.includes('403') || error.message?.includes('Access Not Configured')) {
      await prisma.channel.update({
        where: { id: channelId },
        data: {
          lastSyncError: 'Content ID API access denied - partner access required',
        },
      });
    } else {
      await prisma.channel.update({
        where: { id: channelId },
        data: {
          lastSyncError: error.message,
        },
      });
    }

    throw error;
  }
}

/**
 * Process a single claim from the Content ID API.
 * Creates or updates the corresponding CopyrightEvent in our database.
 */
async function processContentIdClaim(
  claim: ContentIdClaim,
  videoId: string,
  userId: string
): Promise<'new' | 'updated' | 'unchanged'> {
  // Check if we already have this claim
  const existingEvent = await prisma.copyrightEvent.findUnique({
    where: { youtubeClaimId: claim.id },
  });

  // Parse match info
  const matchDetails = parseMatchInfo(claim.matchInfo);

  // Parse policy action
  const policyAction = parsePolicyAction(claim.policy, claim.appliedPolicy);

  // Map Content ID status to our EventStatus
  const mapStatus = (status: string): 'ACTIVE' | 'EXPIRED' | 'WITHDRAWN' | 'DISPUTED' | 'RESOLVED' => {
    switch (status?.toLowerCase()) {
      case 'active':
        return 'ACTIVE';
      case 'inactive':
        return 'RESOLVED';
      case 'appealed':
      case 'disputed':
        return 'DISPUTED';
      case 'pending':
      case 'potential':
        return 'ACTIVE';
      default:
        return 'ACTIVE';
    }
  };

  // Map content type
  const contentType = claim.contentType?.toLowerCase() || 'unknown';

  // Determine event type
  const eventType = policyAction === 'block' ? 'STRIKE' : 'CLAIM';

  // Prepare the claim data
  const claimData = {
    videoId,
    youtubeClaimId: claim.id,
    assetId: claim.assetId,
    type: eventType as 'CLAIM' | 'STRIKE' | 'MONETIZATION_CHANGE' | 'REGION_RESTRICTION',
    status: mapStatus(claim.status),
    contentType,
    claimType: policyAction,
    policyAction,
    matchStartMs: matchDetails?.matchStartMs,
    matchEndMs: matchDetails?.matchEndMs,
    detectedAt: claim.timeCreated ? new Date(claim.timeCreated) : new Date(),
    rawData: claim as any,
  };

  if (existingEvent) {
    // Check if anything changed
    const hasChanges =
      existingEvent.status !== claimData.status ||
      existingEvent.policyAction !== claimData.policyAction;

    if (hasChanges) {
      await prisma.copyrightEvent.update({
        where: { id: existingEvent.id },
        data: {
          status: claimData.status,
          policyAction: claimData.policyAction,
          rawData: claimData.rawData,
        },
      });
      return 'updated';
    }

    return 'unchanged';
  }

  // Create new copyright event
  await prisma.copyrightEvent.create({
    data: claimData,
  });

  return 'new';
}
