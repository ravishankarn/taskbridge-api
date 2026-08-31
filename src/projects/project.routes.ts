import type Database from 'better-sqlite3';
import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { requirePermission } from '../middleware/authorize.middleware';
import { PROJECT_PERMISSIONS } from '../shared/permissions';
import { createProjectsDb } from './project.database';
import { ProjectController } from './project.controller';
import { ProjectRepository } from './project.repository';
import { ProjectService } from './project.service';

/** Wires the projects layered stack (repository -> service -> controller) into an Express router. */
export function createProjectRouter(sqlite: Database.Database): Router {
  const db = createProjectsDb(sqlite);
  const repository = new ProjectRepository(db);
  const service = new ProjectService(repository);
  const controller = new ProjectController(service);

  const router = Router();
  router.use(authenticate);

  router.post('/', requirePermission(PROJECT_PERMISSIONS.CREATE), controller.create);
  router.get('/team/:teamId', requirePermission(PROJECT_PERMISSIONS.READ), controller.getByTeam);
  router.get('/:id', requirePermission(PROJECT_PERMISSIONS.READ), controller.getById);
  router.patch(
    '/:id/status',
    requirePermission(PROJECT_PERMISSIONS.UPDATE),
    controller.updateStatus,
  );
  router.delete('/:id', requirePermission(PROJECT_PERMISSIONS.DELETE), controller.delete);

  return router;
}
