import Database from 'better-sqlite3';
import { createApp } from './app';
import { env } from './config/env';
import { logger } from './config/logger';
import { createNotificationProcessor } from './notifications/notification-processor';

const sqlite = new Database(env.DATABASE_FILE);
const app = createApp(sqlite);

const processor = createNotificationProcessor(sqlite, {
  intervalMs: env.NOTIFICATION_POLL_INTERVAL_MS,
  batchSize: env.NOTIFICATION_BATCH_SIZE,
});

if (env.NOTIFICATION_PROCESSING_ENABLED) {
  processor.start();
} else {
  logger.warn('Notification processing disabled by configuration', {
    operation: 'notification.processor.start',
    outcome: 'skipped',
  });
}

const server = app.listen(env.PORT, () => {
  logger.info(`taskbridge-api listening on port ${env.PORT}`);
});

function shutdown(signal: string): void {
  logger.info('Shutting down', { operation: 'process.shutdown', signal, outcome: 'started' });
  processor.stop();
  server.close(() => {
    sqlite.close();
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
