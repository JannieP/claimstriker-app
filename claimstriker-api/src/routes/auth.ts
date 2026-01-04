import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../config/database.js';
import { hashPassword, verifyPassword } from '../lib/encryption.js';
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

    // Create user
    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name,
      },
      select: {
        id: true,
        email: true,
        name: true,
      },
    });

    // Generate token
    const payload: JWTPayload = {
      userId: user.id,
      email: user.email,
    };
    const token = fastify.jwt.sign(payload);

    const response: AuthResponse = {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    };

    return reply.status(201).send({
      success: true,
      data: response,
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
    };
    const token = fastify.jwt.sign(payload);

    const response: AuthResponse = {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    };

    return reply.send({
      success: true,
      data: response,
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
          createdAt: true,
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

      return reply.send({
        success: true,
        data: {
          id: user.id,
          email: user.email,
          name: user.name,
          createdAt: user.createdAt,
          channelCount: user._count.channels,
        },
      });
    }
  );
}
