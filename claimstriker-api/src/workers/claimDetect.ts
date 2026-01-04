import { Job } from 'bullmq';
import { prisma } from '../config/database.js';
import { decrypt } from '../lib/encryption.js';
import { getVideoDetails, detectPotentialIssues } from '../lib/youtube/api.js';
import { notificationQueue } from './queue.js';
import type { ClaimDetectJob, NotificationJob } from './queue.js';
import type { YouTubeVideoInfo } from '../types/index.js';

export async function processClaimDetect(job: Job<ClaimDetectJob>) {
  const { videoId, channelId } = job.data;

  console.log(`[ClaimDetect] Checking video ${videoId}`);

  // Get video and channel from database
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    include: {
      channel: true,
    },
  });

  if (!video || !video.channel) {
    console.log(`[ClaimDetect] Video ${videoId} not found`);
    return;
  }

  try {
    const accessToken = decrypt(video.channel.accessToken);

    // Get fresh video details from YouTube
    const currentVideo = await getVideoDetails(accessToken, video.youtubeVideoId);

    if (!currentVideo) {
      console.log(`[ClaimDetect] Video ${video.youtubeVideoId} not found on YouTube`);

      // Video might be deleted or made private
      if (video.privacyStatus === 'public') {
        await createCopyrightEvent(
          video.id,
          'MONETIZATION_CHANGE',
          'Video is no longer accessible on YouTube. It may have been deleted or made private.',
          null
        );
      }
      return;
    }

    // Build previous state from stored data
    const previousState: Partial<YouTubeVideoInfo> | undefined = video.previousState
      ? (video.previousState as Partial<YouTubeVideoInfo>)
      : {
          privacyStatus: video.privacyStatus || undefined,
          uploadStatus: video.uploadStatus || undefined,
          blockedRegions: video.blockedRegions,
          monetizationStatus: video.monetizationStatus || undefined,
        };

    // Detect changes
    const { hasIssues, changes } = detectPotentialIssues(currentVideo, previousState);

    if (hasIssues) {
      console.log(`[ClaimDetect] Issues detected for video ${videoId}:`, changes);

      for (const change of changes) {
        // Determine event type
        let eventType: 'CLAIM' | 'STRIKE' | 'MONETIZATION_CHANGE' | 'REGION_RESTRICTION' =
          'MONETIZATION_CHANGE';

        if (change.includes('region block') || change.includes('blocked in')) {
          eventType = 'REGION_RESTRICTION';
        } else if (change.includes('status changed')) {
          eventType = 'MONETIZATION_CHANGE';
        }

        // Check if this exact issue was already detected
        const existingEvent = await prisma.copyrightEvent.findFirst({
          where: {
            videoId: video.id,
            type: eventType,
            status: 'ACTIVE',
            rawData: {
              path: ['changeDescription'],
              equals: change,
            },
          },
        });

        if (!existingEvent) {
          await createCopyrightEvent(video.id, eventType, change, null);

          // Notify user
          await notificationQueue.add('notify', {
            userId: video.channel.userId,
            type: eventType === 'REGION_RESTRICTION' ? 'NEW_CLAIM' : 'MONETIZATION_CHANGE',
            title: eventType === 'REGION_RESTRICTION'
              ? 'New Region Restriction Detected'
              : 'Video Status Changed',
            message: `${video.title}: ${change}`,
            channelId,
            videoId: video.id,
            sendEmail: true,
          } as NotificationJob);
        }
      }
    }

    // Update video with current state for next comparison
    await prisma.video.update({
      where: { id: video.id },
      data: {
        privacyStatus: currentVideo.privacyStatus,
        uploadStatus: currentVideo.uploadStatus,
        blockedRegions: currentVideo.blockedRegions || [],
        allowedRegions: currentVideo.allowedRegions || [],
        viewCount: currentVideo.viewCount,
        likeCount: currentVideo.likeCount,
        previousState: {
          privacyStatus: currentVideo.privacyStatus,
          uploadStatus: currentVideo.uploadStatus,
          blockedRegions: currentVideo.blockedRegions || [],
          monetizationStatus: currentVideo.monetizationStatus,
        },
      },
    });

    console.log(`[ClaimDetect] Completed check for video ${videoId}`);
  } catch (error: any) {
    console.error(`[ClaimDetect] Error checking video ${videoId}:`, error.message);
    throw error;
  }
}

async function createCopyrightEvent(
  videoId: string,
  type: 'CLAIM' | 'STRIKE' | 'MONETIZATION_CHANGE' | 'REGION_RESTRICTION',
  description: string,
  claimantName: string | null
): Promise<void> {
  let claimantId: string | null = null;

  // If we have a claimant name, find or create the claimant
  if (claimantName) {
    const normalizedName = normalizeClaimantName(claimantName);

    const claimant = await prisma.claimant.upsert({
      where: { nameNormalized: normalizedName },
      create: {
        name: claimantName,
        nameNormalized: normalizedName,
        type: 'UNKNOWN',
      },
      update: {},
    });

    claimantId = claimant.id;

    // Update claimant statistics
    await prisma.claimantStatistics.upsert({
      where: { claimantId: claimant.id },
      create: {
        claimantId: claimant.id,
        totalClaims: 1,
      },
      update: {
        totalClaims: { increment: 1 },
      },
    });
  }

  // Create the copyright event
  await prisma.copyrightEvent.create({
    data: {
      videoId,
      type,
      status: 'ACTIVE',
      claimantId,
      explanation: description,
      rawData: {
        changeDescription: description,
        detectedAt: new Date().toISOString(),
      },
    },
  });
}

function normalizeClaimantName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+(inc\.?|llc\.?|ltd\.?|corp\.?|corporation|limited)$/i, '')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
