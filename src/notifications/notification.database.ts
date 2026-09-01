import type Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as milestoneOutboxSchema from '../projects/milestone-outbox.model';
import * as auditEventSchema from './audit-event.model';
import * as notificationSchema from './notification.model';

const schema = {
  ...auditEventSchema,
  ...notificationSchema,
  ...milestoneOutboxSchema,
};

export type NotificationsDb = BetterSQLite3Database<typeof schema>;

/**
 * Owns schema migration for the append-only audit store; DDL only, all queries go through the ORM.
 * The triggers are the enforcement point for immutability: the repository exposes no update or
 * delete methods, and the database rejects those statements even if issued directly.
 */
export function migrateAuditEventsSchema(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS audit_events (
      eventId TEXT PRIMARY KEY,
      tenantId TEXT NOT NULL,
      eventType TEXT NOT NULL,
      entityType TEXT NOT NULL,
      entityId TEXT NOT NULL,
      projectId TEXT NOT NULL,
      actorId TEXT NOT NULL,
      occurredAt TEXT NOT NULL,
      recordedAt TEXT NOT NULL,
      beforeState TEXT,
      afterState TEXT,
      changedFields TEXT NOT NULL,
      metadata TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS audit_events_tenant_occurred_idx ON audit_events (tenantId, occurredAt);
    CREATE INDEX IF NOT EXISTS audit_events_tenant_entity_idx ON audit_events (tenantId, entityId);
    CREATE INDEX IF NOT EXISTS audit_events_tenant_project_idx ON audit_events (tenantId, projectId, occurredAt);

    CREATE TRIGGER IF NOT EXISTS audit_events_block_update
    BEFORE UPDATE ON audit_events
    BEGIN
      SELECT RAISE(ABORT, 'audit_events is append-only: updates are not permitted');
    END;

    CREATE TRIGGER IF NOT EXISTS audit_events_block_delete
    BEFORE DELETE ON audit_events
    BEGIN
      SELECT RAISE(ABORT, 'audit_events is append-only: deletes are not permitted');
    END;
  `);
}

/**
 * Owns schema migration for in-app notification delivery. Dispatch progress lives in its own table
 * so it never depends on `milestone_outbox_events.publishedAt`, which the audit relay already owns.
 */
export function migrateNotificationsSchema(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      tenantId TEXT NOT NULL,
      eventId TEXT NOT NULL,
      recipientUserId TEXT NOT NULL,
      channel TEXT NOT NULL,
      projectId TEXT NOT NULL,
      entityType TEXT NOT NULL,
      entityId TEXT NOT NULL,
      eventType TEXT NOT NULL,
      status TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      readAt TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS notifications_event_recipient_channel_idx
      ON notifications (eventId, recipientUserId, channel);
    CREATE INDEX IF NOT EXISTS notifications_tenant_recipient_idx
      ON notifications (tenantId, recipientUserId, createdAt);

    CREATE TABLE IF NOT EXISTS notification_dispatch_state (
      eventId TEXT PRIMARY KEY,
      tenantId TEXT NOT NULL,
      dispatchedAt TEXT NOT NULL,
      recipientCount INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS notification_dispatch_state_tenant_idx
      ON notification_dispatch_state (tenantId, dispatchedAt);
  `);
}

/**
 * Builds the notifications ORM handle. The projects migrations must already have run on this
 * connection, because the relay reads `milestone_outbox_events` owned by the Project Service.
 */
export function createNotificationsDb(sqlite: Database.Database): NotificationsDb {
  migrateAuditEventsSchema(sqlite);
  migrateNotificationsSchema(sqlite);
  return drizzle(sqlite, { schema });
}
