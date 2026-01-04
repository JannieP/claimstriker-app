import { google } from 'googleapis';
import { env } from '../../config/env.js';
import type { YouTubeTokens } from '../../types/index.js';

const SCOPES = [
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/yt-analytics.readonly',
];

function getOAuth2Client() {
  return new google.auth.OAuth2(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    env.YOUTUBE_REDIRECT_URI
  );
}

export function getAuthUrl(state?: string): string {
  const oauth2Client = getOAuth2Client();

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent', // Force consent to get refresh token
    state,
  });
}

export async function exchangeCodeForTokens(
  code: string
): Promise<YouTubeTokens> {
  const oauth2Client = getOAuth2Client();

  const { tokens } = await oauth2Client.getToken(code);

  if (!tokens.access_token || !tokens.refresh_token) {
    throw new Error('Failed to get tokens from Google');
  }

  const expiresAt = tokens.expiry_date
    ? new Date(tokens.expiry_date)
    : new Date(Date.now() + 3600 * 1000); // Default 1 hour

  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt,
  };
}

export async function refreshAccessToken(
  refreshToken: string
): Promise<YouTubeTokens> {
  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({ refresh_token: refreshToken });

  const { credentials } = await oauth2Client.refreshAccessToken();

  if (!credentials.access_token) {
    throw new Error('Failed to refresh access token');
  }

  const expiresAt = credentials.expiry_date
    ? new Date(credentials.expiry_date)
    : new Date(Date.now() + 3600 * 1000);

  return {
    accessToken: credentials.access_token,
    refreshToken: credentials.refresh_token || refreshToken,
    expiresAt,
  };
}

export function getAuthenticatedClient(accessToken: string) {
  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({ access_token: accessToken });
  return oauth2Client;
}
