import type Database from 'better-sqlite3';
import { logger } from '../config/logger';
import { ProjectMemberRepository } from '../projects/project-member.repository';
import { ProjectMemberService } from '../projects/project-member.service';
import { createProjectsDb } from '../projects/project.database';
import { ProjectRepository } from '../projects/project.repository';
import { AuditEventRepository } from './audit-event.repository';
import { MilestoneAuditRelay } from './audit-relay';
import { MilestoneOutboxReader } from './milestone-outbox.reader';
import { createNotificationsDb } from './notification.database';
import { NotificationDispatchRepository } from './notification-dispatch.repository';
import { NotificationDispatcher } from './notification-dispatcher';
import { NotificationRepository } from './notification.repository';

export interface NotificationProcessorOptions {
  intervalMs: number;
  batchSize?: number;
}

export interface ProcessorTickResult {
  audit: ReturnType<MilestoneAuditRelay['runOnce']>;
  notifications: ReturnType<NotificationDispatcher['runOnce']>;
}

/**
 * Background worker that drains the milestone outbox into `audit_events` and then fans audited
 * events out to in-app notifications.
 *
 * Ordering matters: auditing runs first so the dispatcher always sees a durable audit row. Ticks
 * are non-overlapping, and each stage is independently idempotent, so a crash between the two
 * stages simply replays on the next tick.
 */
export class NotificationProcessor {
  private timer: NodeJS.Timeout | undefined;
  private ticking = false;

  constructor(
    private readonly relay: MilestoneAuditRelay,
    private readonly dispatcher: NotificationDispatcher,
    private readonly intervalMs: number,
  ) {}

  runOnce(): ProcessorTickResult {
    return { audit: this.relay.runOnce(), notifications: this.dispatcher.runOnce() };
  }

  /** Idempotent: calling start() on a running processor does nothing. */
  start(): void {
    if (this.timer) {
      return;
    }

    this.timer = setInterval(() => this.tick(), this.intervalMs);
    // Never keep the process (or a test runner) alive just for the poll timer.
    this.timer.unref();

    logger.info('Notification processing started', {
      operation: 'notification.processor.start',
      intervalMs: this.intervalMs,
      outcome: 'success',
    });
  }

  /** Idempotent: safe to call when never started or already stopped. */
  stop(): void {
    if (!this.timer) {
      return;
    }

    clearInterval(this.timer);
    this.timer = undefined;

    logger.info('Notification processing stopped', {
      operation: 'notification.processor.stop',
      outcome: 'success',
    });
  }

  get isRunning(): boolean {
    return this.timer !== undefined;
  }

  private tick(): void {
    if (this.ticking) {
      return;
    }

    this.ticking = true;
    try {
      this.runOnce();
    } catch (error) {
      logger.error('Notification processing tick failed', {
        operation: 'notification.processor.tick',
        outcome: 'failure',
        reason: error instanceof Error ? error.name : 'UnknownError',
      });
    } finally {
      this.ticking = false;
    }
  }
}

/** Composition root for background processing; shares the caller's SQLite connection. */
export function createNotificationProcessor(
  sqlite: Database.Database,
  options: NotificationProcessorOptions,
): NotificationProcessor {
  const projectsDb = createProjectsDb(sqlite);
  const notificationsDb = createNotificationsDb(sqlite);

  const relay = new MilestoneAuditRelay(
    sqlite,
    new MilestoneOutboxReader(notificationsDb),
    new AuditEventRepository(notificationsDb),
    { batchSize: options.batchSize },
  );

  const dispatcher = new NotificationDispatcher(
    sqlite,
    new NotificationDispatchRepository(notificationsDb),
    new NotificationRepository(notificationsDb),
    new ProjectMemberService(
      new ProjectMemberRepository(projectsDb),
      new ProjectRepository(projectsDb),
    ),
    { batchSize: options.batchSize },
  );

  return new NotificationProcessor(relay, dispatcher, options.intervalMs);
}
