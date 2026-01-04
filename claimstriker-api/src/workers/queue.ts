import { Queue, Worker, Job } from 'bullmq';
import { redis } from '../config/redis.js';

// Queue names
export const QUEUE_NAMES = {
  CHANNEL_SYNC: 'channel-sync',
  CLAIM_DETECT: 'claim-detect',
  NOTIFICATION: 'notification',
} as const;

// Default job options
const defaultJobOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 1000,
  },
  removeOnComplete: {
    count: 1000,
    age: 24 * 3600, // 24 hours
  },
  removeOnFail: {
    count: 5000,
  },
};

// Create queues
export const channelSyncQueue = new Queue(QUEUE_NAMES.CHANNEL_SYNC, {
  connection: redis,
  defaultJobOptions,
});

export const claimDetectQueue = new Queue(QUEUE_NAMES.CLAIM_DETECT, {
  connection: redis,
  defaultJobOptions,
});

export const notificationQueue = new Queue(QUEUE_NAMES.NOTIFICATION, {
  connection: redis,
  defaultJobOptions: {
    ...defaultJobOptions,
    attempts: 5, // More retries for notifications
  },
});

// Job types
export interface ChannelSyncJob {
  channelId: string;
}

export interface ClaimDetectJob {
  videoId: string;
  channelId: string;
}

export interface NotificationJob {
  userId: string;
  type: 'NEW_CLAIM' | 'NEW_STRIKE' | 'MONETIZATION_CHANGE' | 'SYNC_ERROR' | 'WEEKLY_SUMMARY';
  title: string;
  message: string;
  channelId?: string;
  videoId?: string;
  eventId?: string;
  sendEmail?: boolean;
}

// Queue event handlers
function setupQueueEvents(queue: Queue, name: string) {
  queue.on('error', (err) => {
    console.error(`[${name}] Queue error:`, err);
  });
}

setupQueueEvents(channelSyncQueue, QUEUE_NAMES.CHANNEL_SYNC);
setupQueueEvents(claimDetectQueue, QUEUE_NAMES.CLAIM_DETECT);
setupQueueEvents(notificationQueue, QUEUE_NAMES.NOTIFICATION);

// Helper to create a worker
export function createWorker<T>(
  queueName: string,
  processor: (job: Job<T>) => Promise<void>
): Worker<T> {
  const worker = new Worker<T>(queueName, processor, {
    connection: redis,
    concurrency: 5,
  });

  worker.on('completed', (job) => {
    console.log(`[${queueName}] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[${queueName}] Job ${job?.id} failed:`, err.message);
  });

  worker.on('error', (err) => {
    console.error(`[${queueName}] Worker error:`, err);
  });

  return worker;
}

// Graceful shutdown
export async function closeQueues() {
  await Promise.all([
    channelSyncQueue.close(),
    claimDetectQueue.close(),
    notificationQueue.close(),
  ]);
  console.log('All queues closed');
}
