import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import { env } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { disconnectRedis } from './config/redis.js';
import { authRoutes } from './routes/auth.js';
import { channelRoutes } from './routes/channels.js';
import { videoRoutes } from './routes/videos.js';
import { eventRoutes } from './routes/events.js';
import { youtubeRoutes } from './routes/youtube.js';
import { adminRoutes } from './routes/admin.js';
import type { JWTPayload } from './types/index.js';

const fastify = Fastify({
  logger: {
    level: env.NODE_ENV === 'development' ? 'info' : 'warn',
    transport:
      env.NODE_ENV === 'development'
        ? {
            target: 'pino-pretty',
            options: {
              translateTime: 'HH:MM:ss Z',
              ignore: 'pid,hostname',
            },
          }
        : undefined,
  },
});

// Register plugins
await fastify.register(cors, {
  origin: env.FRONTEND_URL,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
});

await fastify.register(jwt, {
  secret: env.JWT_SECRET,
  sign: {
    expiresIn: '7d',
  },
});

// Authentication decorator
fastify.decorate('authenticate', async function (request: any, reply: any) {
  try {
    const payload = await request.jwtVerify();
    request.user = payload as JWTPayload;
  } catch (err) {
    reply.status(401).send({ success: false, error: 'Unauthorized' });
  }
});

// Health check
fastify.get('/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

// Register routes
await fastify.register(authRoutes, { prefix: '/auth' });
await fastify.register(youtubeRoutes, { prefix: '/auth/youtube' });
await fastify.register(channelRoutes, { prefix: '/channels' });
await fastify.register(videoRoutes, { prefix: '/videos' });
await fastify.register(eventRoutes, { prefix: '/events' });
await fastify.register(adminRoutes, { prefix: '/admin' });

// Error handler
fastify.setErrorHandler((error, request, reply) => {
  fastify.log.error(error);

  const statusCode = error.statusCode || 500;
  const message =
    env.NODE_ENV === 'production' && statusCode === 500
      ? 'Internal Server Error'
      : error.message;

  reply.status(statusCode).send({
    success: false,
    error: message,
  });
});

// Graceful shutdown
const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
signals.forEach((signal) => {
  process.on(signal, async () => {
    fastify.log.info(`Received ${signal}, shutting down gracefully`);
    await fastify.close();
    await disconnectDatabase();
    await disconnectRedis();
    process.exit(0);
  });
});

// Start server
async function start() {
  try {
    await connectDatabase();
    await fastify.listen({ port: env.PORT, host: '0.0.0.0' });
    fastify.log.info(`Server running at http://localhost:${env.PORT}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

start();

export { fastify };
