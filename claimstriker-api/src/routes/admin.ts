import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { Role, Permission } from '@prisma/client';
import { prisma } from '../config/database.js';
import {
  requirePermission,
  requireAdmin,
  getPermissionsForRole,
  isSuperAdmin,
} from '../lib/permissions.js';

const paginationSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  search: z.string().optional(),
});

const updateUserSchema = z.object({
  name: z.string().optional(),
  emailVerified: z.boolean().optional(),
});

const updateRoleSchema = z.object({
  role: z.enum(['USER', 'ADMIN', 'SUPER_ADMIN']),
});

export async function adminRoutes(fastify: FastifyInstance) {
  // All admin routes require authentication and admin role
  fastify.addHook('preHandler', async (request, reply) => {
    // First authenticate
    try {
      await (fastify as any).authenticate(request, reply);
    } catch (error) {
      return reply.status(401).send({
        success: false,
        error: 'Authentication required',
      });
    }

    // Then check admin role
    const adminCheck = requireAdmin();
    await adminCheck(request, reply);
  });

  // Get system statistics
  fastify.get('/stats', async (request: FastifyRequest, reply: FastifyReply) => {
    const [
      totalUsers,
      totalChannels,
      totalVideos,
      totalEvents,
      usersByRole,
      recentUsers,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.channel.count(),
      prisma.video.count(),
      prisma.copyrightEvent.count(),
      prisma.user.groupBy({
        by: ['role'],
        _count: true,
      }),
      prisma.user.count({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
          },
        },
      }),
    ]);

    return reply.send({
      success: true,
      data: {
        totalUsers,
        totalChannels,
        totalVideos,
        totalEvents,
        usersByRole: usersByRole.reduce(
          (acc, item) => ({ ...acc, [item.role]: item._count }),
          {} as Record<string, number>
        ),
        recentUsers,
      },
    });
  });

  // List all users (paginated)
  fastify.get(
    '/users',
    {
      preHandler: [requirePermission(Permission.VIEW_USERS) as any],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = paginationSchema.parse(request.query);
      const { page, limit, search } = query;

      const where = search
        ? {
            OR: [
              { email: { contains: search, mode: 'insensitive' as const } },
              { name: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {};

      const [users, total] = await Promise.all([
        prisma.user.findMany({
          where,
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            emailVerified: true,
            createdAt: true,
            _count: {
              select: {
                channels: true,
              },
            },
            channels: {
              select: {
                contentOwnerId: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.user.count({ where }),
      ]);

      return reply.send({
        success: true,
        data: {
          users: users.map((u) => ({
            id: u.id,
            email: u.email,
            name: u.name,
            role: u.role,
            emailVerified: u.emailVerified,
            createdAt: u.createdAt,
            channelCount: u._count.channels,
            hasPartnerAccess: u.channels.some((ch) => ch.contentOwnerId !== null),
          })),
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
          },
        },
      });
    }
  );

  // Get single user details
  fastify.get(
    '/users/:userId',
    {
      preHandler: [requirePermission(Permission.VIEW_USERS) as any],
    },
    async (request: FastifyRequest<{ Params: { userId: string } }>, reply: FastifyReply) => {
      const { userId } = request.params;

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          emailVerified: true,
          createdAt: true,
          updatedAt: true,
          channels: {
            select: {
              id: true,
              title: true,
              youtubeChannelId: true,
              thumbnailUrl: true,
              subscriberCount: true,
              videoCount: true,
              contentOwnerId: true,
              status: true,
              lastSyncAt: true,
              createdAt: true,
            },
          },
          _count: {
            select: {
              channels: true,
              disputes: true,
            },
          },
        },
      });

      if (!user) {
        return reply.status(404).send({
          success: false,
          error: 'User not found',
        });
      }

      return reply.send({
        success: true,
        data: {
          ...user,
          permissions: getPermissionsForRole(user.role),
          hasPartnerAccess: user.channels.some((ch) => ch.contentOwnerId !== null),
          channels: user.channels.map((ch) => ({
            ...ch,
            isPartner: ch.contentOwnerId !== null,
            contentOwnerId: undefined,
          })),
        },
      });
    }
  );

  // Update user (name, emailVerified)
  fastify.patch(
    '/users/:userId',
    {
      preHandler: [requirePermission(Permission.EDIT_USERS) as any],
    },
    async (request: FastifyRequest<{ Params: { userId: string } }>, reply: FastifyReply) => {
      const { userId } = request.params;
      const result = updateUserSchema.safeParse(request.body);

      if (!result.success) {
        return reply.status(400).send({
          success: false,
          error: 'Validation failed',
          details: result.error.flatten(),
        });
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        return reply.status(404).send({
          success: false,
          error: 'User not found',
        });
      }

      const updated = await prisma.user.update({
        where: { id: userId },
        data: result.data,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          emailVerified: true,
        },
      });

      return reply.send({
        success: true,
        data: updated,
      });
    }
  );

  // Update user role (SUPER_ADMIN only)
  fastify.patch(
    '/users/:userId/role',
    {
      preHandler: [requirePermission(Permission.MANAGE_ROLES) as any],
    },
    async (request: FastifyRequest<{ Params: { userId: string } }>, reply: FastifyReply) => {
      const { userId } = request.params;
      const currentUser = request.user as any;
      const result = updateRoleSchema.safeParse(request.body);

      if (!result.success) {
        return reply.status(400).send({
          success: false,
          error: 'Validation failed',
          details: result.error.flatten(),
        });
      }

      const { role: newRole } = result.data;

      // Prevent changing your own role
      if (userId === currentUser.userId) {
        return reply.status(400).send({
          success: false,
          error: 'Cannot change your own role',
        });
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        return reply.status(404).send({
          success: false,
          error: 'User not found',
        });
      }

      // Prevent demoting the last super admin
      if (user.role === Role.SUPER_ADMIN && newRole !== 'SUPER_ADMIN') {
        const superAdminCount = await prisma.user.count({
          where: { role: Role.SUPER_ADMIN },
        });

        if (superAdminCount <= 1) {
          return reply.status(400).send({
            success: false,
            error: 'Cannot demote the last Super Admin',
          });
        }
      }

      const updated = await prisma.user.update({
        where: { id: userId },
        data: { role: newRole as Role },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
        },
      });

      return reply.send({
        success: true,
        data: updated,
      });
    }
  );

  // Delete user (SUPER_ADMIN only)
  fastify.delete(
    '/users/:userId',
    {
      preHandler: [requirePermission(Permission.DELETE_USERS) as any],
    },
    async (request: FastifyRequest<{ Params: { userId: string } }>, reply: FastifyReply) => {
      const { userId } = request.params;
      const currentUser = request.user as any;

      // Prevent deleting yourself
      if (userId === currentUser.userId) {
        return reply.status(400).send({
          success: false,
          error: 'Cannot delete your own account',
        });
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        return reply.status(404).send({
          success: false,
          error: 'User not found',
        });
      }

      // Prevent deleting the last super admin
      if (user.role === Role.SUPER_ADMIN) {
        const superAdminCount = await prisma.user.count({
          where: { role: Role.SUPER_ADMIN },
        });

        if (superAdminCount <= 1) {
          return reply.status(400).send({
            success: false,
            error: 'Cannot delete the last Super Admin',
          });
        }
      }

      await prisma.user.delete({
        where: { id: userId },
      });

      return reply.send({
        success: true,
        data: { message: 'User deleted successfully' },
      });
    }
  );

  // List all channels across all users
  fastify.get(
    '/channels',
    {
      preHandler: [requirePermission(Permission.VIEW_CHANNELS) as any],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = paginationSchema.parse(request.query);
      const { page, limit, search } = query;

      const where = search
        ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' as const } },
              { youtubeChannelId: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {};

      const [channels, total] = await Promise.all([
        prisma.channel.findMany({
          where,
          select: {
            id: true,
            youtubeChannelId: true,
            title: true,
            thumbnailUrl: true,
            subscriberCount: true,
            videoCount: true,
            contentOwnerId: true,
            status: true,
            lastSyncAt: true,
            createdAt: true,
            user: {
              select: {
                id: true,
                email: true,
                name: true,
              },
            },
            _count: {
              select: {
                videos: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.channel.count({ where }),
      ]);

      return reply.send({
        success: true,
        data: {
          channels: channels.map((ch) => ({
            ...ch,
            isPartner: ch.contentOwnerId !== null,
            syncedVideoCount: ch._count.videos,
            contentOwnerId: undefined,
            _count: undefined,
          })),
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
          },
        },
      });
    }
  );
}
