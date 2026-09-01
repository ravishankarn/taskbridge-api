import type Database from 'better-sqlite3';
import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { requirePermission } from '../middleware/authorize.middleware';
import { NOTIFICATION_PERMISSIONS } from '../shared/permissions';
import { createNotificationsDb } from './notification.database';
import { NotificationController } from './notification.controller';
import { NotificationRepository } from './notification.repository';
import { NotificationService } from './notification.service';

/** Wires the notification stack (repository -> service -> controller) into an Express router. */
export function createNotificationRouter(sqlite: Database.Database): Router {
  const db = createNotificationsDb(sqlite);
  const controller = new NotificationController(
    new NotificationService(new NotificationRepository(db)),
  );

  const router = Router();
  router.use(authenticate);

  router.get('/', requirePermission(NOTIFICATION_PERMISSIONS.READ), controller.list);
  router.post('/:id/read', requirePermission(NOTIFICATION_PERMISSIONS.READ), controller.markRead);

  return router;
}
