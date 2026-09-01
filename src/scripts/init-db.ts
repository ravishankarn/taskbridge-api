import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { env } from '../config/env';
import { logger } from '../config/logger';
import {
  migrateAuditEventsSchema,
  migrateNotificationsSchema,
} from '../notifications/notification.database';
import { migrateAllSchemas } from '../projects/project.database';

export function initializeDatabase(dbPath: string = env.DATABASE_FILE): void {
  logger.info(`Initializing SQLite database at: ${dbPath}`);

  const dir = path.dirname(dbPath);
  if (dir && !fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    logger.info(`Created database directory: ${dir}`);
  }

  const sqlite = new Database(dbPath);
  try {
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');

    migrateAllSchemas(sqlite);
    migrateAuditEventsSchema(sqlite);
    migrateNotificationsSchema(sqlite);

    logger.info('Database schema initialized successfully.');
  } finally {
    sqlite.close();
  }
}

/* istanbul ignore next */
if (require.main === module) {
  try {
    initializeDatabase();
  } catch (error) {
    logger.error('Failed to initialize database:', error);
    process.exit(1);
  }
}
