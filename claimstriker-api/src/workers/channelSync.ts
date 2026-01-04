import { Job } from 'bullmq';
import { prisma } from '../config/database.js';
import { decrypt } from '../lib/encryption.js';
import { listVideos, getChannelInfo } from '../lib/youtube/api.js';
import { refreshAccessToken } from '../lib/youtube/oauth.js';
import { encrypt } from '../lib/encryption.js';
import { claimDetectQueue, notificationQueue } from './queue.js';
import type { ChannelSyncJob, ClaimDetectJob, NotificationJob } from './queue.js';

export async function processChannelSync(job: Job<ChannelSyncJob>) {
  const { channelId } = job.data;

  console.log(`[ChannelSync] Starting sync for channel ${channelId}`);

  // Get channel from database
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
  });

  if (!channel) {
    console.log(`[ChannelSync] Channel ${channelId} not found`);
    return;
  }

  if (channel.status !== 'ACTIVE') {
    console.log(`[ChannelSync] Channel ${channelId} is not active, skipping`);
    return;
  }

  let accessToken: string;

  try {
    // Check if token needs refresh
    const now = new Date();
    if (channel.tokenExpiresAt <= now) {
      console.log(`[ChannelSync] Refreshing token for channel ${channelId}`);
      const refreshToken = decrypt(channel.refreshToken);
      const tokens = await refreshAccessToken(refreshToken);

      await prisma.channel.update({
        where: { id: channelId },
        data: {
          accessToken: encrypt(tokens.accessToken),
          refreshToken: encrypt(tokens.refreshToken),
          tokenExpiresAt: tokens.expiresAt,
        },
      });

      accessToken = tokens.accessToken;
    } else {
      accessToken = decrypt(channel.accessToken);
    }

    // Update channel info
    const channelInfo = await getChannelInfo(accessToken);
    await prisma.channel.update({
      where: { id: channelId },
      data: {
        title: channelInfo.title,
        description: channelInfo.description,
        thumbnailUrl: channelInfo.thumbnailUrl,
        subscriberCount: channelInfo.subscriberCount,
        videoCount: channelInfo.videoCount,
      },
    });

    // Fetch all videos (paginated)
    let pageToken: string | undefined;
    let totalVideosSynced = 0;
    let newVideosCount = 0;

    do {
      const result = await listVideos(accessToken, channel.youtubeChannelId, pageToken);

      for (const videoInfo of result.videos) {
        // Upsert video
        const existingVideo = await prisma.video.findUnique({
          where: { youtubeVideoId: videoInfo.id },
        });

        if (existingVideo) {
          // Update existing video
          await prisma.video.update({
            where: { id: existingVideo.id },
            data: {
              title: videoInfo.title,
              description: videoInfo.description,
              thumbnailUrl: videoInfo.thumbnailUrl,
              duration: videoInfo.duration,
              viewCount: videoInfo.viewCount,
              likeCount: videoInfo.likeCount,
              privacyStatus: videoInfo.privacyStatus,
              uploadStatus: videoInfo.uploadStatus,
              license: videoInfo.license,
              madeForKids: videoInfo.madeForKids,
              blockedRegions: videoInfo.blockedRegions || [],
              allowedRegions: videoInfo.allowedRegions || [],
              previousState: existingVideo.previousState || {
                privacyStatus: existingVideo.privacyStatus,
                uploadStatus: existingVideo.uploadStatus,
                blockedRegions: existingVideo.blockedRegions,
                monetizationStatus: existingVideo.monetizationStatus,
              },
            },
          });

          // Queue claim detection job
          await claimDetectQueue.add(
            'detect-claims',
            { videoId: existingVideo.id, channelId } as ClaimDetectJob,
            { jobId: `detect-${existingVideo.id}-${Date.now()}` }
          );
        } else {
          // Create new video
          const newVideo = await prisma.video.create({
            data: {
              channelId,
              youtubeVideoId: videoInfo.id,
              title: videoInfo.title,
              description: videoInfo.description,
              publishedAt: videoInfo.publishedAt,
              thumbnailUrl: videoInfo.thumbnailUrl,
              duration: videoInfo.duration,
              viewCount: videoInfo.viewCount,
              likeCount: videoInfo.likeCount,
              privacyStatus: videoInfo.privacyStatus,
              uploadStatus: videoInfo.uploadStatus,
              license: videoInfo.license,
              madeForKids: videoInfo.madeForKids,
              blockedRegions: videoInfo.blockedRegions || [],
              allowedRegions: videoInfo.allowedRegions || [],
            },
          });

          newVideosCount++;

          // Queue claim detection for new video
          await claimDetectQueue.add(
            'detect-claims',
            { videoId: newVideo.id, channelId } as ClaimDetectJob,
            { jobId: `detect-${newVideo.id}-${Date.now()}` }
          );
        }

        totalVideosSynced++;
      }

      pageToken = result.nextPageToken;

      // Rate limiting - pause between pages
      if (pageToken) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    } while (pageToken);

    // Update last sync time
    await prisma.channel.update({
      where: { id: channelId },
      data: {
        lastSyncAt: new Date(),
        lastSyncError: null,
      },
    });

    console.log(
      `[ChannelSync] Completed sync for channel ${channelId}: ` +
        `${totalVideosSynced} videos synced, ${newVideosCount} new`
    );
  } catch (error: any) {
    console.error(`[ChannelSync] Error syncing channel ${channelId}:`, error.message);

    // Update channel with error
    await prisma.channel.update({
      where: { id: channelId },
      data: {
        lastSyncError: error.message,
        status: error.message.includes('token') ? 'ERROR' : channel.status,
      },
    });

    // Notify user of sync error
    await notificationQueue.add('notify', {
      userId: channel.userId,
      type: 'SYNC_ERROR',
      title: 'Channel Sync Failed',
      message: `Failed to sync channel "${channel.title}": ${error.message}`,
      channelId,
      sendEmail: true,
    } as NotificationJob);

    throw error;
  }
}
