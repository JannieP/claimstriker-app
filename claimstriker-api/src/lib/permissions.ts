import { Role, Permission } from '@prisma/client';
import { FastifyRequest, FastifyReply } from 'fastify';

/**
 * Permission matrix defining which roles have which permissions.
 * SUPER_ADMIN has all permissions (root access).
 */
const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  USER: [],
  ADMIN: [
    Permission.VIEW_USERS,
    Permission.EDIT_USERS,
    Permission.VIEW_CHANNELS,
    Permission.MANAGE_CHANNELS,
    Permission.VIEW_SYSTEM,
  ],
  SUPER_ADMIN: Object.values(Permission), // All permissions
};

/**
 * Check if a role has a specific permission.
 */
export function hasPermission(role: Role, permission: Permission): boolean {
  // SUPER_ADMIN always has all permissions
  if (role === Role.SUPER_ADMIN) {
    return true;
  }

  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

/**
 * Get all permissions for a role.
 */
export function getPermissionsForRole(role: Role): Permission[] {
  if (role === Role.SUPER_ADMIN) {
    return Object.values(Permission);
  }
  return ROLE_PERMISSIONS[role] ?? [];
}

/**
 * Check if a role is admin or higher.
 */
export function isAdmin(role: Role): boolean {
  return role === Role.ADMIN || role === Role.SUPER_ADMIN;
}

/**
 * Check if a role is super admin.
 */
export function isSuperAdmin(role: Role): boolean {
  return role === Role.SUPER_ADMIN;
}

/**
 * Create a Fastify preHandler that checks for a specific permission.
 * Must be used after the authenticate middleware.
 */
export function requirePermission(permission: Permission) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user;

    if (!user) {
      return reply.status(401).send({
        success: false,
        error: 'Authentication required',
      });
    }

    const userRole = (user as any).role as Role;

    if (!hasPermission(userRole, permission)) {
      return reply.status(403).send({
        success: false,
        error: 'Insufficient permissions',
      });
    }
  };
}

/**
 * Create a Fastify preHandler that checks for admin role.
 * Must be used after the authenticate middleware.
 */
export function requireAdmin() {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user;

    if (!user) {
      return reply.status(401).send({
        success: false,
        error: 'Authentication required',
      });
    }

    const userRole = (user as any).role as Role;

    if (!isAdmin(userRole)) {
      return reply.status(403).send({
        success: false,
        error: 'Admin access required',
      });
    }
  };
}

/**
 * Create a Fastify preHandler that checks for super admin role.
 * Must be used after the authenticate middleware.
 */
export function requireSuperAdmin() {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user;

    if (!user) {
      return reply.status(401).send({
        success: false,
        error: 'Authentication required',
      });
    }

    const userRole = (user as any).role as Role;

    if (!isSuperAdmin(userRole)) {
      return reply.status(403).send({
        success: false,
        error: 'Super Admin access required',
      });
    }
  };
}
