export const TenantRoleSchemaValues = ['admin', 'manager', 'member'] as const;
export type TenantRole = (typeof TenantRoleSchemaValues)[number];

export const PROJECT_PERMISSIONS = {
  CREATE: 'projects:create',
  READ: 'projects:read',
  UPDATE: 'projects:update',
  DELETE: 'projects:delete',
} as const;

export type Permission = (typeof PROJECT_PERMISSIONS)[keyof typeof PROJECT_PERMISSIONS];

// Only tenant admins may manage users/roles/settings; this map governs project resource access only.
const ROLE_PERMISSIONS: Record<TenantRole, readonly Permission[]> = {
  admin: [
    PROJECT_PERMISSIONS.CREATE,
    PROJECT_PERMISSIONS.READ,
    PROJECT_PERMISSIONS.UPDATE,
    PROJECT_PERMISSIONS.DELETE,
  ],
  manager: [PROJECT_PERMISSIONS.CREATE, PROJECT_PERMISSIONS.READ, PROJECT_PERMISSIONS.UPDATE],
  member: [PROJECT_PERMISSIONS.READ],
};

export function roleHasPermission(role: TenantRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
