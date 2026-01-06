import { google } from 'googleapis';
import { getAuthenticatedClient } from './oauth.js';

// Type for YouTube Partner API params
interface ClaimSearchParams {
  onBehalfOfContentOwner: string;
  videoId?: string;
  status?: string;
  createdAfter?: string;
  createdBefore?: string;
  pageToken?: string;
  includeThirdPartyClaims?: boolean;
}

// Types for Content ID API responses
export interface ContentOwner {
  id: string;
  displayName: string;
  primaryNotificationEmails?: string[];
}

export interface ContentIdClaim {
  id: string;
  assetId: string;
  videoId: string;
  status: string;
  contentType: string;  // AUDIO, VIDEO, AUDIOVISUAL
  timeCreated: string;
  timeStatusLastModified?: string;
  policy?: {
    id?: string;
    name?: string;
    rules?: Array<{
      action: string;  // monetize, block, track
      conditions?: Array<{
        type: string;
        value?: string[];
      }>;
    }>;
  };
  appliedPolicy?: {
    rules?: Array<{
      action: string;
    }>;
  };
  matchInfo?: {
    matchSegments?: Array<{
      video_segment?: {
        start: string;
        duration: string;
      };
      reference_segment?: {
        start: string;
        duration: string;
      };
      channel?: string;
    }>;
    referenceId?: string;
    longestMatch?: {
      durationSecs?: string;
    };
    totalMatch?: {
      referenceDurationSecs?: string;
      userVideoDurationSecs?: string;
    };
  };
  origin?: {
    source?: string;
  };
  isPartnerUploaded?: boolean;
  blockOutsideOwnership?: boolean;
  ugcType?: string;
}

export interface ClaimSearchResult {
  items: ContentIdClaim[];
  nextPageToken?: string;
  pageInfo?: {
    totalResults: number;
    resultsPerPage: number;
  };
}

export interface AssetInfo {
  id: string;
  type: string;
  title?: string;
  customId?: string;
  metadata?: {
    title?: string;
    description?: string;
    artist?: string;
    album?: string;
    isrc?: string;
  };
}

function getYouTubePartnerClient(accessToken: string) {
  const auth = getAuthenticatedClient(accessToken);
  // The YouTube Partner API types may not be fully defined in googleapis
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (google as any).youtubePartner({ version: 'v1', auth });
}

/**
 * Get the content owner ID for the authenticated user.
 * This is required for all Content ID API calls.
 */
export async function getContentOwner(
  accessToken: string
): Promise<ContentOwner | null> {
  const youtubePartner = getYouTubePartnerClient(accessToken);

  try {
    const response = await youtubePartner.contentOwners.list({
      fetchMine: true,
    });

    const contentOwner = response.data.items?.[0];
    if (!contentOwner || !contentOwner.id) {
      return null;
    }

    return {
      id: contentOwner.id,
      displayName: contentOwner.displayName || 'Unknown',
      primaryNotificationEmails: contentOwner.primaryNotificationEmails || [],
    };
  } catch (error: any) {
    console.error('[ContentID] Error fetching content owner:', error.message);
    throw error;
  }
}

/**
 * Search for claims on videos owned by the content owner.
 * Can filter by video IDs, status, date range, etc.
 */
export async function searchClaims(
  accessToken: string,
  contentOwnerId: string,
  options: {
    videoId?: string;
    videoIds?: string[];
    status?: 'active' | 'inactive' | 'pending' | 'potential' | 'appealed' | 'disputed';
    createdAfter?: Date;
    createdBefore?: Date;
    pageToken?: string;
    includeThirdPartyClaims?: boolean;
  } = {}
): Promise<ClaimSearchResult> {
  const youtubePartner = getYouTubePartnerClient(accessToken);

  try {
    const params: ClaimSearchParams = {
      onBehalfOfContentOwner: contentOwnerId,
    };

    // Handle video ID(s)
    if (options.videoId) {
      params.videoId = options.videoId;
    } else if (options.videoIds && options.videoIds.length > 0) {
      params.videoId = options.videoIds.join(',');
    }

    if (options.status) {
      params.status = options.status.toUpperCase();
    }

    if (options.createdAfter) {
      params.createdAfter = options.createdAfter.toISOString().split('T')[0];
    }

    if (options.createdBefore) {
      params.createdBefore = options.createdBefore.toISOString().split('T')[0];
    }

    if (options.pageToken) {
      params.pageToken = options.pageToken;
    }

    if (options.includeThirdPartyClaims !== undefined) {
      params.includeThirdPartyClaims = options.includeThirdPartyClaims;
    }

    const response = await youtubePartner.claimSearch.list(params);

    return {
      items: (response.data.items || []) as ContentIdClaim[],
      nextPageToken: response.data.nextPageToken || undefined,
      pageInfo: response.data.pageInfo as ClaimSearchResult['pageInfo'],
    };
  } catch (error: any) {
    console.error('[ContentID] Error searching claims:', error.message);
    throw error;
  }
}

/**
 * Get details for a specific claim by ID.
 */
export async function getClaim(
  accessToken: string,
  contentOwnerId: string,
  claimId: string
): Promise<ContentIdClaim | null> {
  const youtubePartner = getYouTubePartnerClient(accessToken);

  try {
    const response = await youtubePartner.claims.get({
      claimId,
      onBehalfOfContentOwner: contentOwnerId,
    });

    if (!response.data) {
      return null;
    }

    return response.data as ContentIdClaim;
  } catch (error: any) {
    console.error('[ContentID] Error fetching claim:', error.message);
    throw error;
  }
}

/**
 * Get claim history for a specific claim.
 */
export async function getClaimHistory(
  accessToken: string,
  contentOwnerId: string,
  claimId: string
): Promise<any[]> {
  const youtubePartner = getYouTubePartnerClient(accessToken);

  try {
    const response = await youtubePartner.claimHistory.get({
      claimId,
      onBehalfOfContentOwner: contentOwnerId,
    });

    return response.data.event || [];
  } catch (error: any) {
    console.error('[ContentID] Error fetching claim history:', error.message);
    throw error;
  }
}

/**
 * Get asset details by ID.
 */
export async function getAsset(
  accessToken: string,
  contentOwnerId: string,
  assetId: string
): Promise<AssetInfo | null> {
  const youtubePartner = getYouTubePartnerClient(accessToken);

  try {
    const response = await youtubePartner.assets.get({
      assetId,
      onBehalfOfContentOwner: contentOwnerId,
    });

    if (!response.data) {
      return null;
    }

    return {
      id: response.data.id || assetId,
      type: response.data.type || 'unknown',
      title: response.data.label,
      customId: response.data.customId || undefined,
      metadata: response.data.metadata as AssetInfo['metadata'],
    };
  } catch (error: any) {
    console.error('[ContentID] Error fetching asset:', error.message);
    throw error;
  }
}

/**
 * List all claims for videos owned by the content owner.
 * Fetches all pages automatically.
 */
export async function listAllClaims(
  accessToken: string,
  contentOwnerId: string,
  options: {
    status?: 'active' | 'inactive' | 'pending' | 'potential';
    createdAfter?: Date;
    maxResults?: number;
  } = {}
): Promise<ContentIdClaim[]> {
  const allClaims: ContentIdClaim[] = [];
  let pageToken: string | undefined;
  const maxResults = options.maxResults || 1000;

  do {
    const result = await searchClaims(accessToken, contentOwnerId, {
      status: options.status,
      createdAfter: options.createdAfter,
      pageToken,
    });

    allClaims.push(...result.items);
    pageToken = result.nextPageToken;

    // Rate limiting
    if (pageToken) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  } while (pageToken && allClaims.length < maxResults);

  return allClaims;
}

/**
 * Get claims for specific video IDs.
 * Useful for checking claims on videos we've synced.
 */
export async function getClaimsForVideos(
  accessToken: string,
  contentOwnerId: string,
  videoIds: string[]
): Promise<Map<string, ContentIdClaim[]>> {
  const claimsByVideo = new Map<string, ContentIdClaim[]>();

  // Initialize map
  for (const videoId of videoIds) {
    claimsByVideo.set(videoId, []);
  }

  // Content ID API allows up to 50 video IDs per request
  const batchSize = 50;
  for (let i = 0; i < videoIds.length; i += batchSize) {
    const batch = videoIds.slice(i, i + batchSize);

    try {
      const result = await searchClaims(accessToken, contentOwnerId, {
        videoIds: batch,
        includeThirdPartyClaims: true,
      });

      for (const claim of result.items) {
        const existing = claimsByVideo.get(claim.videoId) || [];
        existing.push(claim);
        claimsByVideo.set(claim.videoId, existing);
      }
    } catch (error: any) {
      console.error(`[ContentID] Error fetching claims for batch:`, error.message);
    }

    // Rate limiting between batches
    if (i + batchSize < videoIds.length) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  return claimsByVideo;
}

/**
 * Parse match info to get human-readable match details.
 */
export function parseMatchInfo(matchInfo?: ContentIdClaim['matchInfo']): {
  matchStartMs: number;
  matchEndMs: number;
  matchDurationSecs: number;
  matchType: string;
} | null {
  if (!matchInfo || !matchInfo.matchSegments || matchInfo.matchSegments.length === 0) {
    return null;
  }

  const segment = matchInfo.matchSegments[0];
  const videoSegment = segment.video_segment;

  if (!videoSegment) {
    return null;
  }

  // Parse ISO 8601 duration (e.g., "PT1M30S" = 90 seconds)
  const parseIsoDuration = (duration: string): number => {
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/);
    if (!match) return 0;

    const hours = parseFloat(match[1] || '0');
    const minutes = parseFloat(match[2] || '0');
    const seconds = parseFloat(match[3] || '0');

    return hours * 3600 + minutes * 60 + seconds;
  };

  const startSecs = parseIsoDuration(videoSegment.start || 'PT0S');
  const durationSecs = parseIsoDuration(videoSegment.duration || 'PT0S');

  return {
    matchStartMs: Math.round(startSecs * 1000),
    matchEndMs: Math.round((startSecs + durationSecs) * 1000),
    matchDurationSecs: durationSecs,
    matchType: segment.channel || 'unknown',
  };
}

/**
 * Parse policy to get the primary action being applied.
 */
export function parsePolicyAction(
  policy?: ContentIdClaim['policy'],
  appliedPolicy?: ContentIdClaim['appliedPolicy']
): string {
  const policyToCheck = appliedPolicy || policy;

  if (!policyToCheck?.rules || policyToCheck.rules.length === 0) {
    return 'unknown';
  }

  // Get the first rule's action (usually the most significant)
  const primaryRule = policyToCheck.rules[0];
  return primaryRule.action?.toLowerCase() || 'unknown';
}
