import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../config/database.js';
import { env } from '../config/env.js';
import { encrypt, decrypt } from '../lib/encryption.js';
import {
  getAuthUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
} from '../lib/youtube/oauth.js';
import { getChannelInfo } from '../lib/youtube/api.js';

const callbackSchema = z.object({
  code: z.string(),
  state: z.string().optional(),
});

export async function youtubeRoutes(fastify: FastifyInstance) {
  // Get YouTube OAuth URL
  fastify.get(
    '/url',
    {
      preHandler: [fastify.authenticate as any],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { userId } = request.user!;

      // Use userId as state to verify callback
      const state = Buffer.from(JSON.stringify({ userId })).toString('base64');
      const url = getAuthUrl(state);

      return reply.send({
        success: true,
        data: { url },
      });
    }
  );

  // OAuth callback - exchange code for tokens and link channel
  fastify.get('/callback', async (request: FastifyRequest, reply: FastifyReply) => {
    const frontendUrl = env.FRONTEND_URL;

    const result = callbackSchema.safeParse(request.query);
    if (!result.success) {
      return reply.redirect(`${frontendUrl}/channels?error=invalid_callback`);
    }

    const { code, state } = result.data;

    // Decode state to get userId
    let userId: string;
    try {
      const decoded = JSON.parse(Buffer.from(state || '', 'base64').toString());
      userId = decoded.userId;
      if (!userId) throw new Error('No userId in state');
    } catch {
      return reply.redirect(`${frontendUrl}/channels?error=invalid_state`);
    }

    // Verify user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return reply.redirect(`${frontendUrl}/channels?error=user_not_found`);
    }

    try {
      // Exchange code for tokens
      const tokens = await exchangeCodeForTokens(code);

      // Get channel info from YouTube
      const channelInfo = await getChannelInfo(tokens.accessToken);

      // Check if channel is already linked
      const existingChannel = await prisma.channel.findUnique({
        where: { youtubeChannelId: channelInfo.id },
      });

      if (existingChannel) {
        if (existingChannel.userId === userId) {
          // Update existing channel with new tokens
          await prisma.channel.update({
            where: { id: existingChannel.id },
            data: {
              accessToken: encrypt(tokens.accessToken),
              refreshToken: encrypt(tokens.refreshToken),
              tokenExpiresAt: tokens.expiresAt,
              status: 'ACTIVE',
              title: channelInfo.title,
              description: channelInfo.description,
              thumbnailUrl: channelInfo.thumbnailUrl,
              subscriberCount: channelInfo.subscriberCount,
              videoCount: channelInfo.videoCount,
            },
          });

          return reply.redirect(`${frontendUrl}/channels?success=reconnected`);
        } else {
          return reply.redirect(`${frontendUrl}/channels?error=channel_already_linked`);
        }
      }

      // Create new channel
      await prisma.channel.create({
        data: {
          userId,
          youtubeChannelId: channelInfo.id,
          title: channelInfo.title,
          description: channelInfo.description,
          thumbnailUrl: channelInfo.thumbnailUrl,
          subscriberCount: channelInfo.subscriberCount,
          videoCount: channelInfo.videoCount,
          accessToken: encrypt(tokens.accessToken),
          refreshToken: encrypt(tokens.refreshToken),
          tokenExpiresAt: tokens.expiresAt,
        },
      });

      return reply.redirect(`${frontendUrl}/channels?success=connected`);
    } catch (error) {
      fastify.log.error(error);
      return reply.redirect(`${frontendUrl}/channels?error=link_failed`);
    }
  });

  // Refresh token endpoint (for internal use / cron jobs)
  fastify.post(
    '/refresh/:channelId',
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

      try {
        const currentRefreshToken = decrypt(channel.refreshToken);
        const tokens = await refreshAccessToken(currentRefreshToken);

        await prisma.channel.update({
          where: { id: channelId },
          data: {
            accessToken: encrypt(tokens.accessToken),
            refreshToken: encrypt(tokens.refreshToken),
            tokenExpiresAt: tokens.expiresAt,
            status: 'ACTIVE',
          },
        });

        return reply.send({
          success: true,
          data: { message: 'Token refreshed successfully' },
        });
      } catch (error) {
        fastify.log.error(error);

        // Mark channel as having an error
        await prisma.channel.update({
          where: { id: channelId },
          data: {
            status: 'ERROR',
            lastSyncError: 'Failed to refresh token - reauthorization required',
          },
        });

        return reply.status(401).send({
          success: false,
          error: 'Failed to refresh token - please reconnect your channel',
        });
      }
    }
  );
}
