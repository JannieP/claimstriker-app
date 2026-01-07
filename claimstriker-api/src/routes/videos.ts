import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../config/database.js';

const listQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  channelId: z.string().optional(),
  search: z.string().optional(),
  hasEvents: z.coerce.boolean().optional(),
  videoType: z.enum(['all', 'short', 'long']).default('all'),
  sortBy: z.enum(['publishedAt', 'title', 'viewCount']).default('publishedAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// Parse ISO 8601 duration to seconds
function parseDurationToSeconds(duration: string | null): number {
  if (!duration) return 0;

  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;

  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  const seconds = parseInt(match[3] || '0', 10);

  return hours * 3600 + minutes * 60 + seconds;
}

// Check if video is a Short (≤60 seconds)
function isShortVideo(duration: string | null): boolean {
  return parseDurationToSeconds(duration) <= 60;
}

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

      // If filtering by video type, we need to fetch all and filter in memory
      // This is because duration is stored as ISO 8601 string
      const needsTypeFilter = query.videoType !== 'all';

      const baseSelect = {
        id: true,
        youtubeVideoId: true,
        title: true,
        description: true,
        thumbnailUrl: true,
        publishedAt: true,
        viewCount: true,
        likeCount: true,
        privacyStatus: true,
        duration: true,
        license: true,
        madeForKids: true,
        blockedRegions: true,
        allowedRegions: true,
        monetizationStatus: true,
        uploadStatus: true,
        createdAt: true,
        updatedAt: true,
        channel: {
          select: {
            id: true,
            title: true,
          },
        },
        copyrightEvents: {
          select: {
            id: true,
            type: true,
            status: true,
            claimType: true,
            contentType: true,
            claimedContent: true,
            policyAction: true,
            monetizationImpact: true,
            viewabilityImpact: true,
            affectedRegions: true,
            matchStartMs: true,
            matchEndMs: true,
            explanation: true,
            detectedAt: true,
            resolvedAt: true,
            claimant: {
              select: {
                id: true,
                name: true,
                type: true,
              },
            },
          },
          orderBy: { detectedAt: 'desc' as const },
        },
        _count: {
          select: {
            copyrightEvents: true,
          },
        },
      };

      if (needsTypeFilter) {
        // Fetch all matching videos to filter by type
        const allVideos = await prisma.video.findMany({
          where,
          select: baseSelect,
          orderBy: { [query.sortBy]: query.sortOrder },
        });

        // Filter by video type
        const filteredVideos = allVideos.filter((v) => {
          const isShort = isShortVideo(v.duration);
          return query.videoType === 'short' ? isShort : !isShort;
        });

        const total = filteredVideos.length;
        const paginatedVideos = filteredVideos.slice(
          (query.page - 1) * query.limit,
          query.page * query.limit
        );

        return reply.send({
          success: true,
          data: paginatedVideos.map((v) => ({
            ...v,
            eventCount: v._count.copyrightEvents,
            events: v.copyrightEvents,
            youtubeUrl: `https://www.youtube.com/watch?v=${v.youtubeVideoId}`,
            isShort: isShortVideo(v.duration),
            durationSeconds: parseDurationToSeconds(v.duration),
            copyrightEvents: undefined,
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

      // Standard pagination without type filter
      const [videos, total] = await Promise.all([
        prisma.video.findMany({
          where,
          select: baseSelect,
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
          events: v.copyrightEvents,
          youtubeUrl: `https://www.youtube.com/watch?v=${v.youtubeVideoId}`,
          isShort: isShortVideo(v.duration),
          durationSeconds: parseDurationToSeconds(v.duration),
          copyrightEvents: undefined,
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
