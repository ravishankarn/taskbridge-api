import type Database from 'better-sqlite3';
import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { requirePermission } from '../middleware/authorize.middleware';
import { MILESTONE_PERMISSIONS, PROJECT_MEMBER_PERMISSIONS, PROJECT_PERMISSIONS } from '../shared/permissions';
import { MilestoneOutboxRepository } from './milestone-outbox.repository';
import { MilestoneController } from './milestone.controller';
import { MilestoneRepository } from './milestone.repository';
import { MilestoneService } from './milestone.service';
import { createProjectsDb } from './project.database';
import { ProjectController } from './project.controller';
import { ProjectMemberController } from './project-member.controller';
import { ProjectMemberRepository } from './project-member.repository';
import { ProjectMemberService } from './project-member.service';
import { ProjectRepository } from './project.repository';
import { ProjectService } from './project.service';

/** Wires the projects layered stack (repository -> service -> controller) into an Express router. */
export function createProjectRouter(sqlite: Database.Database): Router {
  const db = createProjectsDb(sqlite);

  const projectRepository = new ProjectRepository(db);
  const projectService = new ProjectService(projectRepository);
  const projectController = new ProjectController(projectService);

  const milestoneRepository = new MilestoneRepository(db);
  const outboxRepository = new MilestoneOutboxRepository(db);
  const milestoneService = new MilestoneService(
    sqlite,
    milestoneRepository,
    outboxRepository,
    projectRepository,
  );
  const milestoneController = new MilestoneController(milestoneService);

  const memberRepository = new ProjectMemberRepository(db);
  const memberService = new ProjectMemberService(memberRepository, projectRepository);
  const memberController = new ProjectMemberController(memberService);

  const router = Router();
  router.use(authenticate);

  router.post('/', requirePermission(PROJECT_PERMISSIONS.CREATE), projectController.create);
  router.get('/team/:teamId', requirePermission(PROJECT_PERMISSIONS.READ), projectController.getByTeam);
  router.get('/:id', requirePermission(PROJECT_PERMISSIONS.READ), projectController.getById);
  router.patch(
    '/:id/status',
    requirePermission(PROJECT_PERMISSIONS.UPDATE),
    projectController.updateStatus,
  );
  router.delete('/:id', requirePermission(PROJECT_PERMISSIONS.DELETE), projectController.delete);

  router.post(
    '/:projectId/milestones',
    requirePermission(MILESTONE_PERMISSIONS.CREATE),
    milestoneController.create,
  );
  router.get(
    '/:projectId/milestones',
    requirePermission(MILESTONE_PERMISSIONS.READ),
    milestoneController.listByProject,
  );
  router.get(
    '/:projectId/milestones/:milestoneId',
    requirePermission(MILESTONE_PERMISSIONS.READ),
    milestoneController.getById,
  );
  router.patch(
    '/:projectId/milestones/:milestoneId',
    requirePermission(MILESTONE_PERMISSIONS.UPDATE),
    milestoneController.update,
  );
  router.post(
    '/:projectId/milestones/:milestoneId/close',
    requirePermission(MILESTONE_PERMISSIONS.CLOSE),
    milestoneController.close,
  );

  router.post(
    '/:projectId/members',
    requirePermission(PROJECT_MEMBER_PERMISSIONS.MANAGE),
    memberController.addMember,
  );
  router.get(
    '/:projectId/members',
    requirePermission(PROJECT_MEMBER_PERMISSIONS.READ),
    memberController.listMembers,
  );
  router.delete(
    '/:projectId/members/:userId',
    requirePermission(PROJECT_MEMBER_PERMISSIONS.MANAGE),
    memberController.removeMember,
  );

  return router;
}
