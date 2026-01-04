import { Job } from 'bullmq';
import { prisma } from '../config/database.js';
import type { NotificationJob } from './queue.js';

export async function processNotification(job: Job<NotificationJob>) {
  const { userId, type, title, message, channelId, videoId, eventId, sendEmail } = job.data;

  console.log(`[Notification] Creating notification for user ${userId}: ${title}`);

  try {
    // Create in-app notification
    await prisma.notification.create({
      data: {
        userId,
        type,
        title,
        message,
        channelId,
        videoId,
        eventId,
      },
    });

    // Send email if requested
    if (sendEmail) {
      await sendEmailNotification(userId, title, message, type);
    }

    console.log(`[Notification] Notification created for user ${userId}`);
  } catch (error: any) {
    console.error(`[Notification] Error creating notification:`, error.message);
    throw error;
  }
}

async function sendEmailNotification(
  userId: string,
  title: string,
  message: string,
  type: string
): Promise<void> {
  // Get user email
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, name: true },
  });

  if (!user) {
    console.log(`[Notification] User ${userId} not found, skipping email`);
    return;
  }

  // TODO: Implement actual email sending with SendGrid
  // For now, just log it
  console.log(`[Notification] Would send email to ${user.email}:`);
  console.log(`  Subject: ${title}`);
  console.log(`  Body: ${message}`);

  // Example SendGrid implementation:
  /*
  import sgMail from '@sendgrid/mail';
  import { env } from '../config/env.js';

  sgMail.setApiKey(env.SENDGRID_API_KEY);

  const msg = {
    to: user.email,
    from: env.EMAIL_FROM,
    subject: `[ClaimStriker] ${title}`,
    text: message,
    html: generateEmailHtml(title, message, type),
  };

  await sgMail.send(msg);
  */

  // Mark notification as email sent
  await prisma.notification.updateMany({
    where: {
      userId,
      title,
      emailSent: false,
    },
    data: {
      emailSent: true,
      emailSentAt: new Date(),
    },
  });
}

function generateEmailHtml(title: string, message: string, type: string): string {
  const typeColors: Record<string, string> = {
    NEW_CLAIM: '#f59e0b',
    NEW_STRIKE: '#ef4444',
    MONETIZATION_CHANGE: '#3b82f6',
    SYNC_ERROR: '#6b7280',
    WEEKLY_SUMMARY: '#8b5cf6',
  };

  const color = typeColors[type] || '#3b82f6';

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, ${color}, ${color}dd); padding: 20px; border-radius: 8px 8px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 24px;">${title}</h1>
        </div>
        <div style="background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
          <p style="margin: 0 0 16px 0;">${message}</p>
          <a href="https://claimstriker.com/dashboard" style="display: inline-block; background: ${color}; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500;">
            View in Dashboard
          </a>
        </div>
        <p style="color: #6b7280; font-size: 12px; margin-top: 16px;">
          You're receiving this because you have notifications enabled for your ClaimStriker account.
        </p>
      </body>
    </html>
  `;
}
