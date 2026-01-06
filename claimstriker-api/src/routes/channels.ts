import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../config/database.js';
import { channelSyncQueue, claimSyncQueue } from '../workers/queue.js';

const paginationSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

export async function channelRoutes(fastify: FastifyInstance) {
  // List user's channels
  fastify.get(
    '/',
    {
      preHandler: [fastify.authenticate as any],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { userId } = request.user!;

      const channels = await prisma.channel.findMany({
        where: { userId },
        select: {
          id: true,
          youtubeChannelId: true,
          title: true,
          description: true,
          thumbnailUrl: true,
          subscriberCount: true,
          videoCount: true,
          contentOwnerId: true,
          status: true,
          lastSyncAt: true,
          lastClaimSyncAt: true,
          lastSyncError: true,
          createdAt: true,
          _count: {
            select: {
              videos: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      return reply.send({
        success: true,
        data: channels.map((c) => ({
          ...c,
          syncedVideoCount: c._count.videos,
          isPartner: c.contentOwnerId !== null,
          contentOwnerId: undefined,
          _count: undefined,
        })),
      });
    }
  );

  // Get single channel details
  fastify.get(
    '/:channelId',
    {
      preHandler: [fastify.authenticate as any],
    },
    async (request: FastifyRequest<{ Params: { channelId: string } }>, reply: FastifyReply) => {
      const { channelId } = request.params;
      const { userId } = request.user!;

      const channel = await prisma.channel.findFirst({
        where: {
          id: channelId,
          userId,
        },
        select: {
          id: true,
          youtubeChannelId: true,
          title: true,
          description: true,
          thumbnailUrl: true,
          subscriberCount: true,
          videoCount: true,
          status: true,
          lastSyncAt: true,
          lastSyncError: true,
          createdAt: true,
          _count: {
            select: {
              videos: true,
            },
          },
        },
      });

      if (!channel) {
        return reply.status(404).send({
          success: false,
          error: 'Channel not found',
        });
      }

      // Get event counts
      const eventCounts = await prisma.copyrightEvent.groupBy({
        by: ['type', 'status'],
        where: {
          video: {
            channelId,
          },
        },
        _count: true,
      });

      return reply.send({
        success: true,
        data: {
          ...channel,
          syncedVideoCount: channel._count.videos,
          eventCounts,
          _count: undefined,
        },
      });
    }
  );

  // Trigger manual sync
  fastify.post(
    '/:channelId/sync',
    {
      preHandler: [fastify.authenticate as any],
    },
    async (request: FastifyRequest<{ Params: { channelId: string } }>, reply: FastifyReply) => {
      const { channelId } = request.params;
      const { userId } = request.user!;

      const channel = await prisma.channel.findFirst({
        where: {
          id: channelId,
          userId,
        },
      });

      if (!channel) {
        return reply.status(404).send({
          success: false,
          error: 'Channel not found',
        });
      }

      if (channel.status !== 'ACTIVE') {
        return reply.status(400).send({
          success: false,
          error: 'Channel is not active. Please reconnect your YouTube account.',
        });
      }

      // Queue sync job
      await channelSyncQueue.add(
        'sync-channel',
        { channelId },
        {
          jobId: `sync-${channelId}-${Date.now()}`,
          removeOnComplete: true,
          removeOnFail: 100,
        }
      );

      return reply.send({
        success: true,
        data: { message: 'Sync job queued' },
      });
    }
  );

  // Trigger claim sync (Content ID API)
  fastify.post(
    '/:channelId/sync-claims',
    {
      preHandler: [fastify.authenticate as any],
    },
    async (request: FastifyRequest<{
      Params: { channelId: string };
      Querystring: { fullSync?: string };
    }>, reply: FastifyReply) => {
      const { channelId } = request.params;
      const { fullSync } = request.query as { fullSync?: string };
      const { userId } = request.user!;

      const channel = await prisma.channel.findFirst({
        where: {
          id: channelId,
          userId,
        },
      });

      if (!channel) {
        return reply.status(404).send({
          success: false,
          error: 'Channel not found',
        });
      }

      if (channel.status !== 'ACTIVE') {
        return reply.status(400).send({
          success: false,
          error: 'Channel is not active. Please reconnect your YouTube account.',
        });
      }

      // Queue claim sync job
      await claimSyncQueue.add(
        'sync-claims',
        {
          channelId,
          fullSync: fullSync === 'true',
        },
        {
          jobId: `claim-sync-${channelId}-${Date.now()}`,
          removeOnComplete: true,
          removeOnFail: 100,
        }
      );

      return reply.send({
        success: true,
        data: { message: 'Claim sync job queued. This uses the YouTube Content ID API to fetch real claim data.' },
      });
    }
  );

  // Delete/unlink channel
  fastify.delete(
    '/:channelId',
    {
      preHandler: [fastify.authenticate as any],
    },
    async (request: FastifyRequest<{ Params: { channelId: string } }>, reply: FastifyReply) => {
      const { channelId } = request.params;
      const { userId } = request.user!;

      const channel = await prisma.channel.findFirst({
        where: {
          id: channelId,
          userId,
        },
      });

      if (!channel) {
        return reply.status(404).send({
          success: false,
          error: 'Channel not found',
        });
      }

      // Delete channel and all associated data (cascade)
      await prisma.channel.delete({
        where: { id: channelId },
      });

      return reply.send({
        success: true,
        data: { message: 'Channel unlinked successfully' },
      });
    }
  );

  // Pause/resume channel monitoring
  fastify.patch(
    '/:channelId/status',
    {
      preHandler: [fastify.authenticate as any],
    },
    async (request: FastifyRequest<{
      Params: { channelId: string };
      Body: { status: 'ACTIVE' | 'PAUSED' };
    }>, reply: FastifyReply) => {
      const { channelId } = request.params;
      const { status } = request.body as { status: 'ACTIVE' | 'PAUSED' };
      const { userId } = request.user!;

      if (!['ACTIVE', 'PAUSED'].includes(status)) {
        return reply.status(400).send({
          success: false,
          error: 'Invalid status. Must be ACTIVE or PAUSED.',
        });
      }

      const channel = await prisma.channel.findFirst({
        where: {
          id: channelId,
          userId,
        },
      });

      if (!channel) {
        return reply.status(404).send({
          success: false,
          error: 'Channel not found',
        });
      }

      // Can't activate a channel with revoked tokens
      if (status === 'ACTIVE' && channel.status === 'REVOKED') {
        return reply.status(400).send({
          success: false,
          error: 'Please reconnect your YouTube account first',
        });
      }

      await prisma.channel.update({
        where: { id: channelId },
        data: { status },
      });

      return reply.send({
        success: true,
        data: { message: `Channel ${status === 'ACTIVE' ? 'resumed' : 'paused'}` },
      });
    }
  );
}
