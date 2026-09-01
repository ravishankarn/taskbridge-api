import type Database from 'better-sqlite3';
import { z } from 'zod';
import { logger } from '../config/logger';
import { withTransaction } from '../shared/database';
import { assertSnapshotSize, redactSensitive } from '../shared/redaction';
import { AuditEventSchema, type AuditEvent } from './audit-event.model';
import type { AuditEventRepository } from './audit-event.repository';
import {
  MilestoneOutboxRowSchema,
  type MilestoneOutboxRawRow,
  type MilestoneOutboxReader,
} from './milestone-outbox.reader';

const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_MAX_ATTEMPTS = 5;

const JsonObjectSchema = z.record(z.unknown());
const ChangedFieldsSchema = z.array(z.string());

export interface AuditRelayOptions {
  batchSize?: number;
  maxAttempts?: number;
}

export interface AuditRelayResult {
  fetched: number;
  recorded: number;
  duplicates: number;
  failed: number;
}

function parseSnapshot(raw: string | null): Record<string, unknown> | null {
  if (raw === null) {
    return null;
  }
  const snapshot = redactSensitive(JsonObjectSchema.parse(JSON.parse(raw)));
  assertSnapshotSize(snapshot);
  return snapshot as Record<string, unknown>;
}

function parseMetadata(raw: string): Record<string, unknown> {
  const metadata = redactSensitive(JsonObjectSchema.parse(JSON.parse(raw)));
  assertSnapshotSize(metadata);
  return metadata as Record<string, unknown>;
}

/**
 * Drains the Project Service milestone outbox into the append-only audit store.
 *
 * The relay owns no event capture: milestone mutations already write outbox rows transactionally.
 * Delivery is at-least-once, so idempotency comes from reusing the outbox `eventId` as the audit
 * primary key — a replayed batch collides on the key and records nothing new.
 */
export class MilestoneAuditRelay {
  private readonly batchSize: number;
  private readonly maxAttempts: number;

  constructor(
    private readonly sqlite: Database.Database,
    private readonly outboxReader: MilestoneOutboxReader,
    private readonly auditRepository: AuditEventRepository,
    options: AuditRelayOptions = {},
  ) {
    this.batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
    this.maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  }

  /** Processes one batch of unpublished outbox rows. Safe to call repeatedly. */
  runOnce(): AuditRelayResult {
    const rows = this.outboxReader.findUnpublished(this.batchSize, this.maxAttempts);
    const result: AuditRelayResult = {
      fetched: rows.length,
      recorded: 0,
      duplicates: 0,
      failed: 0,
    };

    for (const row of rows) {
      try {
        const event = this.toAuditEvent(row);
        const inserted = withTransaction(this.sqlite, () => {
          const wrote = this.auditRepository.insertIfAbsent(event);
          this.outboxReader.markPublished(event.tenantId, event.eventId, event.recordedAt);
          return wrote;
        });

        if (inserted) {
          result.recorded += 1;
        } else {
          result.duplicates += 1;
        }

        logger.info('Milestone event relayed to audit store', {
          tenantId: event.tenantId,
          operation: 'audit.relay',
          eventId: event.eventId,
          eventType: event.eventType,
          outcome: inserted ? 'recorded' : 'duplicate',
        });
      } catch (error) {
        result.failed += 1;
        this.outboxReader.recordFailedAttempt(row.tenantId, row.eventId);
        logger.error('Failed to relay milestone event to audit store', {
          tenantId: row.tenantId,
          operation: 'audit.relay',
          eventId: row.eventId,
          outcome: 'failure',
          // Only the error class is logged: parser messages can echo raw payload fragments.
          reason: error instanceof Error ? error.name : 'UnknownError',
        });
      }
    }

    return result;
  }

  private toAuditEvent(row: MilestoneOutboxRawRow): AuditEvent {
    const event = MilestoneOutboxRowSchema.parse(row);
    return AuditEventSchema.parse({
      eventId: event.eventId,
      tenantId: event.tenantId,
      eventType: event.eventType,
      entityType: 'milestone',
      entityId: event.milestoneId,
      projectId: event.projectId,
      actorId: event.actorId,
      occurredAt: event.occurredAt,
      recordedAt: new Date().toISOString(),
      before: parseSnapshot(event.beforeState),
      after: parseSnapshot(event.afterState),
      changedFields: ChangedFieldsSchema.parse(JSON.parse(event.changedFields)),
      metadata: parseMetadata(event.metadata),
    });
  }
}
