import type Database from 'better-sqlite3';
import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { requirePermission } from '../middleware/authorize.middleware';
import { ProjectMemberRepository } from '../projects/project-member.repository';
import { ProjectMemberService } from '../projects/project-member.service';
import { createProjectsDb } from '../projects/project.database';
import { ProjectRepository } from '../projects/project.repository';
import { AUDIT_PERMISSIONS } from '../shared/permissions';
import { AuditEventController } from './audit-event.controller';
import { AuditEventRepository } from './audit-event.repository';
import { AuditEventService } from './audit-event.service';
import { createNotificationsDb } from './notification.database';

/** Wires the audit read stack (repository -> service -> controller) into an Express router. */
export function createAuditEventRouter(sqlite: Database.Database): Router {
  const db = createNotificationsDb(sqlite);
  const projectsDb = createProjectsDb(sqlite);
  const projectAccess = new ProjectMemberService(
    new ProjectMemberRepository(projectsDb),
    new ProjectRepository(projectsDb),
  );
  const controller = new AuditEventController(
    new AuditEventService(new AuditEventRepository(db), projectAccess),
  );

  const router = Router();
  router.use(authenticate);

  router.get('/', requirePermission(AUDIT_PERMISSIONS.READ), controller.list);
  router.get('/:eventId', requirePermission(AUDIT_PERMISSIONS.READ), controller.getById);

  return router;
}
