import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../config/database.js';

const listQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  channelId: z.string().optional(),
  search: z.string().optional(),
  hasEvents: z.coerce.boolean().optional(),
  sortBy: z.enum(['publishedAt', 'title', 'viewCount']).default('publishedAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export async function videoRoutes(fastify: FastifyInstance) {
  // List videos
  fastify.get(
    '/',
    {
      preHandler: [fastify.authenticate as any],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { userId } = request.user!;
      const query = listQuerySchema.parse(request.query);

      const where: any = {
        channel: {
          userId,
        },
      };

      if (query.channelId) {
        where.channelId = query.channelId;
      }

      if (query.search) {
        where.OR = [
          { title: { contains: query.search, mode: 'insensitive' } },
          { description: { contains: query.search, mode: 'insensitive' } },
        ];
      }

      if (query.hasEvents !== undefined) {
        if (query.hasEvents) {
          where.copyrightEvents = { some: {} };
        } else {
          where.copyrightEvents = { none: {} };
        }
      }

      const [videos, total] = await Promise.all([
        prisma.video.findMany({
          where,
          select: {
            id: true,
            youtubeVideoId: true,
            title: true,
            thumbnailUrl: true,
            publishedAt: true,
            viewCount: true,
            privacyStatus: true,
            channel: {
              select: {
                id: true,
                title: true,
              },
            },
            _count: {
              select: {
                copyrightEvents: true,
              },
            },
          },
          orderBy: { [query.sortBy]: query.sortOrder },
          skip: (query.page - 1) * query.limit,
          take: query.limit,
        }),
        prisma.video.count({ where }),
      ]);

      return reply.send({
        success: true,
        data: videos.map((v) => ({
          ...v,
          eventCount: v._count.copyrightEvents,
          youtubeUrl: `https://www.youtube.com/watch?v=${v.youtubeVideoId}`,
          _count: undefined,
        })),
        pagination: {
          page: query.page,
          limit: query.limit,
          total,
          totalPages: Math.ceil(total / query.limit),
        },
      });
    }
  );

  // Get video details
  fastify.get(
    '/:videoId',
    {
      preHandler: [fastify.authenticate as any],
    },
    async (request: FastifyRequest<{ Params: { videoId: string } }>, reply: FastifyReply) => {
      const { videoId } = request.params;
      const { userId } = request.user!;

      const video = await prisma.video.findFirst({
        where: {
          id: videoId,
          channel: {
            userId,
          },
        },
        include: {
          channel: {
            select: {
              id: true,
              title: true,
              thumbnailUrl: true,
            },
          },
          copyrightEvents: {
            include: {
              claimant: {
                select: {
                  id: true,
                  name: true,
                  type: true,
                },
              },
              _count: {
                select: {
                  disputes: true,
                },
              },
            },
            orderBy: { detectedAt: 'desc' },
          },
        },
      });

      if (!video) {
        return reply.status(404).send({
          success: false,
          error: 'Video not found',
        });
      }

      return reply.send({
        success: true,
        data: {
          ...video,
          youtubeUrl: `https://www.youtube.com/watch?v=${video.youtubeVideoId}`,
          copyrightEvents: video.copyrightEvents.map((e) => ({
            ...e,
            disputeCount: e._count.disputes,
            _count: undefined,
          })),
        },
      });
    }
  );

  // Get video by YouTube ID
  fastify.get(
    '/youtube/:youtubeVideoId',
    {
      preHandler: [fastify.authenticate as any],
    },
    async (request: FastifyRequest<{ Params: { youtubeVideoId: string } }>, reply: FastifyReply) => {
      const { youtubeVideoId } = request.params;
      const { userId } = request.user!;

      const video = await prisma.video.findFirst({
        where: {
          youtubeVideoId,
          channel: {
            userId,
          },
        },
        include: {
          channel: {
            select: {
              id: true,
              title: true,
            },
          },
          copyrightEvents: {
            include: {
              claimant: {
                select: {
                  id: true,
                  name: true,
                  type: true,
                },
              },
            },
            orderBy: { detectedAt: 'desc' },
          },
        },
      });

      if (!video) {
        return reply.status(404).send({
          success: false,
          error: 'Video not found',
        });
      }

      return reply.send({
        success: true,
        data: {
          ...video,
          youtubeUrl: `https://www.youtube.com/watch?v=${video.youtubeVideoId}`,
        },
      });
    }
  );
}
