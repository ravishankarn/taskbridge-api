export const TenantRoleSchemaValues = ['admin', 'manager', 'member'] as const;
export type TenantRole = (typeof TenantRoleSchemaValues)[number];

export const PROJECT_PERMISSIONS = {
  CREATE: 'projects:create',
  READ: 'projects:read',
  UPDATE: 'projects:update',
  DELETE: 'projects:delete',
} as const;

export const MILESTONE_PERMISSIONS = {
  CREATE: 'milestones:create',
  READ: 'milestones:read',
  UPDATE: 'milestones:update',
  CLOSE: 'milestones:close',
} as const;

export const PROJECT_MEMBER_PERMISSIONS = {
  MANAGE: 'projects:members:manage',
  READ: 'projects:members:read',
} as const;

export const AUDIT_PERMISSIONS = {
  READ: 'audit:read',
} as const;

export const NOTIFICATION_PERMISSIONS = {
  READ: 'notifications:read',
} as const;

export type Permission =
  | (typeof PROJECT_PERMISSIONS)[keyof typeof PROJECT_PERMISSIONS]
  | (typeof MILESTONE_PERMISSIONS)[keyof typeof MILESTONE_PERMISSIONS]
  | (typeof PROJECT_MEMBER_PERMISSIONS)[keyof typeof PROJECT_MEMBER_PERMISSIONS]
  | (typeof AUDIT_PERMISSIONS)[keyof typeof AUDIT_PERMISSIONS]
  | (typeof NOTIFICATION_PERMISSIONS)[keyof typeof NOTIFICATION_PERMISSIONS];

// Only tenant admins may manage users/roles/settings; this map governs project-resource and
// audit-history access only. Members cannot read compliance history.
const ROLE_PERMISSIONS: Record<TenantRole, readonly Permission[]> = {
  admin: [
    PROJECT_PERMISSIONS.CREATE,
    PROJECT_PERMISSIONS.READ,
    PROJECT_PERMISSIONS.UPDATE,
    PROJECT_PERMISSIONS.DELETE,
    MILESTONE_PERMISSIONS.CREATE,
    MILESTONE_PERMISSIONS.READ,
    MILESTONE_PERMISSIONS.UPDATE,
    MILESTONE_PERMISSIONS.CLOSE,
    PROJECT_MEMBER_PERMISSIONS.MANAGE,
    PROJECT_MEMBER_PERMISSIONS.READ,
    AUDIT_PERMISSIONS.READ,
    NOTIFICATION_PERMISSIONS.READ,
  ],
  manager: [
    PROJECT_PERMISSIONS.CREATE,
    PROJECT_PERMISSIONS.READ,
    PROJECT_PERMISSIONS.UPDATE,
    MILESTONE_PERMISSIONS.CREATE,
    MILESTONE_PERMISSIONS.READ,
    MILESTONE_PERMISSIONS.UPDATE,
    MILESTONE_PERMISSIONS.CLOSE,
    PROJECT_MEMBER_PERMISSIONS.MANAGE,
    PROJECT_MEMBER_PERMISSIONS.READ,
    AUDIT_PERMISSIONS.READ,
    NOTIFICATION_PERMISSIONS.READ,
  ],
  member: [
    PROJECT_PERMISSIONS.READ,
    MILESTONE_PERMISSIONS.READ,
    PROJECT_MEMBER_PERMISSIONS.READ,
    NOTIFICATION_PERMISSIONS.READ,
  ],
};

export function roleHasPermission(role: TenantRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
