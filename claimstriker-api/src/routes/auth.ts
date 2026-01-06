import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { Role } from '@prisma/client';
import { prisma } from '../config/database.js';
import { hashPassword, verifyPassword } from '../lib/encryption.js';
import { getPermissionsForRole } from '../lib/permissions.js';
import type { AuthResponse, JWTPayload } from '../types/index.js';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export async function authRoutes(fastify: FastifyInstance) {
  // Register
  fastify.post('/register', async (request: FastifyRequest, reply: FastifyReply) => {
    const result = registerSchema.safeParse(request.body);
    if (!result.success) {
      return reply.status(400).send({
        success: false,
        error: 'Validation failed',
        details: result.error.flatten(),
      });
    }

    const { email, password, name } = result.data;

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return reply.status(409).send({
        success: false,
        error: 'Email already registered',
      });
    }

    // Check if this is the first user or matches SUPER_ADMIN_EMAIL
    const userCount = await prisma.user.count();
    const superAdminEmail = process.env.SUPER_ADMIN_EMAIL;
    const shouldBeSuperAdmin =
      userCount === 0 || (superAdminEmail && email.toLowerCase() === superAdminEmail.toLowerCase());

    // Create user
    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name,
        role: shouldBeSuperAdmin ? Role.SUPER_ADMIN : Role.USER,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
      },
    });

    // Generate token
    const payload: JWTPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
    };
    const token = fastify.jwt.sign(payload);

    return reply.status(201).send({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          permissions: getPermissionsForRole(user.role),
        },
      },
    });
  });

  // Login
  fastify.post('/login', async (request: FastifyRequest, reply: FastifyReply) => {
    const result = loginSchema.safeParse(request.body);
    if (!result.success) {
      return reply.status(400).send({
        success: false,
        error: 'Validation failed',
        details: result.error.flatten(),
      });
    }

    const { email, password } = result.data;

    // Find user
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        passwordHash: true,
      },
    });

    if (!user) {
      return reply.status(401).send({
        success: false,
        error: 'Invalid email or password',
      });
    }

    // Verify password
    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      return reply.status(401).send({
        success: false,
        error: 'Invalid email or password',
      });
    }

    // Generate token
    const payload: JWTPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
    };
    const token = fastify.jwt.sign(payload);

    return reply.send({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          permissions: getPermissionsForRole(user.role),
        },
      },
    });
  });

  // Get current user
  fastify.get(
    '/me',
    {
      preHandler: [fastify.authenticate as any],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { userId } = request.user!;

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          createdAt: true,
          channels: {
            select: {
              id: true,
              contentOwnerId: true,
            },
          },
          _count: {
            select: {
              channels: true,
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

      // Check if any channel has partner access (contentOwnerId is set)
      const hasPartnerAccess = user.channels.some((ch) => ch.contentOwnerId !== null);

      return reply.send({
        success: true,
        data: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          permissions: getPermissionsForRole(user.role),
          createdAt: user.createdAt,
          channelCount: user._count.channels,
          hasPartnerAccess,
        },
      });
    }
  );
}
