import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { disconnectRedis } from '../config/redis.js';
import {
  createWorker,
  closeQueues,
  QUEUE_NAMES,
  type ChannelSyncJob,
  type ClaimSyncJob,
  type ClaimDetectJob,
  type NotificationJob,
} from './queue.js';
import { processChannelSync } from './channelSync.js';
import { processClaimSync } from './claimSync.js';
import { processClaimDetect } from './claimDetect.js';
import { processNotification } from './notification.js';
import { runScheduler } from './scheduler.js';

console.log('Starting ClaimStriker workers...');

// Connect to database
await connectDatabase();

// Create workers
const channelSyncWorker = createWorker<ChannelSyncJob>(
  QUEUE_NAMES.CHANNEL_SYNC,
  processChannelSync
);

const claimSyncWorker = createWorker<ClaimSyncJob>(
  QUEUE_NAMES.CLAIM_SYNC,
  processClaimSync
);

const claimDetectWorker = createWorker<ClaimDetectJob>(
  QUEUE_NAMES.CLAIM_DETECT,
  processClaimDetect
);

const notificationWorker = createWorker<NotificationJob>(
  QUEUE_NAMES.NOTIFICATION,
  processNotification
);

console.log('Workers started:');
console.log(`  - ${QUEUE_NAMES.CHANNEL_SYNC}`);
console.log(`  - ${QUEUE_NAMES.CLAIM_SYNC}`);
console.log(`  - ${QUEUE_NAMES.CLAIM_DETECT}`);
console.log(`  - ${QUEUE_NAMES.NOTIFICATION}`);

// Start scheduler
await runScheduler();

// Graceful shutdown
const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
signals.forEach((signal) => {
  process.on(signal, async () => {
    console.log(`\nReceived ${signal}, shutting down workers gracefully...`);

    // Close workers first
    await Promise.all([
      channelSyncWorker.close(),
      claimSyncWorker.close(),
      claimDetectWorker.close(),
      notificationWorker.close(),
    ]);
    console.log('Workers closed');

    // Close queues
    await closeQueues();

    // Disconnect from services
    await disconnectDatabase();
    await disconnectRedis();

    console.log('Shutdown complete');
    process.exit(0);
  });
});

// Keep the process running
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
});
