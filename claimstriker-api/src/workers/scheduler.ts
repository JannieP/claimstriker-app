import { prisma } from '../config/database.js';
import { channelSyncQueue } from './queue.js';
import type { ChannelSyncJob } from './queue.js';

const SYNC_INTERVAL_HOURS = 4;

export async function runScheduler() {
  console.log('[Scheduler] Starting scheduler');

  // Run immediately on startup
  await scheduleAllChannelSyncs();

  // Then run every SYNC_INTERVAL_HOURS
  setInterval(
    async () => {
      await scheduleAllChannelSyncs();
    },
    SYNC_INTERVAL_HOURS * 60 * 60 * 1000
  );
}

async function scheduleAllChannelSyncs() {
  console.log('[Scheduler] Scheduling sync jobs for all active channels');

  try {
    // Get all active channels
    const channels = await prisma.channel.findMany({
      where: {
        status: 'ACTIVE',
      },
      select: {
        id: true,
        title: true,
        lastSyncAt: true,
      },
    });

    console.log(`[Scheduler] Found ${channels.length} active channels`);

    // Schedule sync for each channel with a small delay between them
    // to avoid hitting rate limits
    for (let i = 0; i < channels.length; i++) {
      const channel = channels[i];

      await channelSyncQueue.add(
        'sync-channel',
        { channelId: channel.id } as ChannelSyncJob,
        {
          jobId: `scheduled-sync-${channel.id}-${Date.now()}`,
          delay: i * 5000, // 5 seconds between each channel
        }
      );

      console.log(`[Scheduler] Queued sync for channel "${channel.title}" (${channel.id})`);
    }

    console.log('[Scheduler] All sync jobs scheduled');
  } catch (error) {
    console.error('[Scheduler] Error scheduling syncs:', error);
  }
}

// Run a one-time sync for a specific channel
export async function scheduleSingleChannelSync(channelId: string) {
  await channelSyncQueue.add(
    'sync-channel',
    { channelId } as ChannelSyncJob,
    {
      jobId: `manual-sync-${channelId}-${Date.now()}`,
    }
  );
}
