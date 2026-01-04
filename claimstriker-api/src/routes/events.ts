import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../config/database.js';
import type { DashboardSummary } from '../types/index.js';

const listQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  channelId: z.string().optional(),
  videoId: z.string().optional(),
  type: z.enum(['CLAIM', 'STRIKE', 'MONETIZATION_CHANGE', 'REGION_RESTRICTION']).optional(),
  status: z.enum(['ACTIVE', 'EXPIRED', 'WITHDRAWN', 'DISPUTED', 'RESOLVED']).optional(),
  claimantId: z.string().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  sortBy: z.enum(['detectedAt', 'type', 'status']).default('detectedAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export async function eventRoutes(fastify: FastifyInstance) {
  // Dashboard summary
  fastify.get(
    '/summary',
    {
      preHandler: [fastify.authenticate as any],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { userId } = request.user!;

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const [
        activeStrikes,
        activeClaims,
        pendingDisputes,
        claimsLast30Days,
        channelCount,
        videoCount,
      ] = await Promise.all([
        // Active strikes
        prisma.copyrightEvent.count({
          where: {
            type: 'STRIKE',
            status: 'ACTIVE',
            video: {
              channel: { userId },
            },
          },
        }),
        // Active claims
        prisma.copyrightEvent.count({
          where: {
            type: 'CLAIM',
            status: 'ACTIVE',
            video: {
              channel: { userId },
            },
          },
        }),
        // Pending disputes
        prisma.dispute.count({
          where: {
            userId,
            status: { in: ['DRAFT', 'READY', 'SUBMITTED'] },
          },
        }),
        // Claims in last 30 days
        prisma.copyrightEvent.count({
          where: {
            detectedAt: { gte: thirtyDaysAgo },
            video: {
              channel: { userId },
            },
          },
        }),
        // Channel count
        prisma.channel.count({
          where: { userId },
        }),
        // Video count
        prisma.video.count({
          where: {
            channel: { userId },
          },
        }),
      ]);

      const summary: DashboardSummary = {
        activeStrikes,
        activeClaims,
        pendingDisputes,
        claimsLast30Days,
        channelCount,
        videoCount,
      };

      return reply.send({
        success: true,
        data: summary,
      });
    }
  );

  // List events
  fastify.get(
    '/',
    {
      preHandler: [fastify.authenticate as any],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { userId } = request.user!;
      const query = listQuerySchema.parse(request.query);

      const where: any = {
        video: {
          channel: {
            userId,
          },
        },
      };

      if (query.channelId) {
        where.video = {
          ...where.video,
          channelId: query.channelId,
        };
      }

      if (query.videoId) {
        where.videoId = query.videoId;
      }

      if (query.type) {
        where.type = query.type;
      }

      if (query.status) {
        where.status = query.status;
      }

      if (query.claimantId) {
        where.claimantId = query.claimantId;
      }

      if (query.startDate || query.endDate) {
        where.detectedAt = {};
        if (query.startDate) {
          where.detectedAt.gte = query.startDate;
        }
        if (query.endDate) {
          where.detectedAt.lte = query.endDate;
        }
      }

      const [events, total] = await Promise.all([
        prisma.copyrightEvent.findMany({
          where,
          include: {
            video: {
              select: {
                id: true,
                youtubeVideoId: true,
                title: true,
                thumbnailUrl: true,
                channel: {
                  select: {
                    id: true,
                    title: true,
                  },
                },
              },
            },
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
          orderBy: { [query.sortBy]: query.sortOrder },
          skip: (query.page - 1) * query.limit,
          take: query.limit,
        }),
        prisma.copyrightEvent.count({ where }),
      ]);

      return reply.send({
        success: true,
        data: events.map((e) => ({
          ...e,
          disputeCount: e._count.disputes,
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

  // Get event details
  fastify.get(
    '/:eventId',
    {
      preHandler: [fastify.authenticate as any],
    },
    async (request: FastifyRequest<{ Params: { eventId: string } }>, reply: FastifyReply) => {
      const { eventId } = request.params;
      const { userId } = request.user!;

      const event = await prisma.copyrightEvent.findFirst({
        where: {
          id: eventId,
          video: {
            channel: {
              userId,
            },
          },
        },
        include: {
          video: {
            include: {
              channel: {
                select: {
                  id: true,
                  title: true,
                  thumbnailUrl: true,
                },
              },
            },
          },
          claimant: {
            include: {
              statistics: true,
            },
          },
          disputes: {
            orderBy: { createdAt: 'desc' },
          },
        },
      });

      if (!event) {
        return reply.status(404).send({
          success: false,
          error: 'Event not found',
        });
      }

      return reply.send({
        success: true,
        data: event,
      });
    }
  );

  // Get events timeline (for charts)
  fastify.get(
    '/timeline',
    {
      preHandler: [fastify.authenticate as any],
    },
    async (request: FastifyRequest<{
      Querystring: { days?: string };
    }>, reply: FastifyReply) => {
      const { userId } = request.user!;
      const days = parseInt(request.query.days || '30', 10);

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const events = await prisma.copyrightEvent.findMany({
        where: {
          detectedAt: { gte: startDate },
          video: {
            channel: { userId },
          },
        },
        select: {
          id: true,
          type: true,
          detectedAt: true,
        },
        orderBy: { detectedAt: 'asc' },
      });

      // Group by date
      const timeline: Record<string, { claims: number; strikes: number; other: number }> = {};

      events.forEach((event) => {
        const date = event.detectedAt.toISOString().split('T')[0];
        if (!timeline[date]) {
          timeline[date] = { claims: 0, strikes: 0, other: 0 };
        }
        if (event.type === 'CLAIM') {
          timeline[date].claims++;
        } else if (event.type === 'STRIKE') {
          timeline[date].strikes++;
        } else {
          timeline[date].other++;
        }
      });

      return reply.send({
        success: true,
        data: Object.entries(timeline).map(([date, counts]) => ({
          date,
          ...counts,
        })),
      });
    }
  );

  // Update event status
  fastify.patch(
    '/:eventId/status',
    {
      preHandler: [fastify.authenticate as any],
    },
    async (request: FastifyRequest<{
      Params: { eventId: string };
      Body: { status: string };
    }>, reply: FastifyReply) => {
      const { eventId } = request.params;
      const { status } = request.body;
      const { userId } = request.user!;

      const validStatuses = ['ACTIVE', 'EXPIRED', 'WITHDRAWN', 'DISPUTED', 'RESOLVED'];
      if (!validStatuses.includes(status)) {
        return reply.status(400).send({
          success: false,
          error: 'Invalid status',
        });
      }

      const event = await prisma.copyrightEvent.findFirst({
        where: {
          id: eventId,
          video: {
            channel: { userId },
          },
        },
      });

      if (!event) {
        return reply.status(404).send({
          success: false,
          error: 'Event not found',
        });
      }

      const updated = await prisma.copyrightEvent.update({
        where: { id: eventId },
        data: {
          status: status as any,
          resolvedAt: ['RESOLVED', 'EXPIRED', 'WITHDRAWN'].includes(status)
            ? new Date()
            : null,
        },
      });

      return reply.send({
        success: true,
        data: updated,
      });
    }
  );
}
