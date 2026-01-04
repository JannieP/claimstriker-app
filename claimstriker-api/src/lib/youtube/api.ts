import { google, youtube_v3 } from 'googleapis';
import { getAuthenticatedClient } from './oauth.js';
import type { YouTubeChannelInfo, YouTubeVideoInfo } from '../../types/index.js';

function getYouTubeClient(accessToken: string) {
  const auth = getAuthenticatedClient(accessToken);
  return google.youtube({ version: 'v3', auth });
}

export async function getChannelInfo(
  accessToken: string
): Promise<YouTubeChannelInfo> {
  const youtube = getYouTubeClient(accessToken);

  const response = await youtube.channels.list({
    part: ['snippet', 'statistics'],
    mine: true,
  });

  const channel = response.data.items?.[0];
  if (!channel || !channel.id) {
    throw new Error('No channel found for this account');
  }

  return {
    id: channel.id,
    title: channel.snippet?.title || 'Unknown',
    description: channel.snippet?.description || undefined,
    thumbnailUrl: channel.snippet?.thumbnails?.default?.url || undefined,
    subscriberCount: channel.statistics?.subscriberCount
      ? parseInt(channel.statistics.subscriberCount, 10)
      : undefined,
    videoCount: channel.statistics?.videoCount
      ? parseInt(channel.statistics.videoCount, 10)
      : undefined,
  };
}

export async function listVideos(
  accessToken: string,
  channelId: string,
  pageToken?: string
): Promise<{ videos: YouTubeVideoInfo[]; nextPageToken?: string }> {
  const youtube = getYouTubeClient(accessToken);

  // First, search for videos in the channel
  const searchResponse = await youtube.search.list({
    part: ['id'],
    channelId,
    type: ['video'],
    maxResults: 50,
    order: 'date',
    pageToken,
  });

  const videoIds = searchResponse.data.items
    ?.map((item) => item.id?.videoId)
    .filter((id): id is string => !!id);

  if (!videoIds || videoIds.length === 0) {
    return { videos: [], nextPageToken: undefined };
  }

  // Then get full video details
  const videosResponse = await youtube.videos.list({
    part: ['snippet', 'contentDetails', 'status', 'statistics'],
    id: videoIds,
  });

  const videos: YouTubeVideoInfo[] = (videosResponse.data.items || []).map(
    (video) => parseVideoResponse(video)
  );

  return {
    videos,
    nextPageToken: searchResponse.data.nextPageToken || undefined,
  };
}

export async function getVideoDetails(
  accessToken: string,
  videoId: string
): Promise<YouTubeVideoInfo | null> {
  const youtube = getYouTubeClient(accessToken);

  const response = await youtube.videos.list({
    part: ['snippet', 'contentDetails', 'status', 'statistics'],
    id: [videoId],
  });

  const video = response.data.items?.[0];
  if (!video) {
    return null;
  }

  return parseVideoResponse(video);
}

export async function getMultipleVideoDetails(
  accessToken: string,
  videoIds: string[]
): Promise<YouTubeVideoInfo[]> {
  const youtube = getYouTubeClient(accessToken);

  // YouTube API allows max 50 videos per request
  const batches: string[][] = [];
  for (let i = 0; i < videoIds.length; i += 50) {
    batches.push(videoIds.slice(i, i + 50));
  }

  const allVideos: YouTubeVideoInfo[] = [];

  for (const batch of batches) {
    const response = await youtube.videos.list({
      part: ['snippet', 'contentDetails', 'status', 'statistics'],
      id: batch,
    });

    const videos = (response.data.items || []).map((video) =>
      parseVideoResponse(video)
    );
    allVideos.push(...videos);
  }

  return allVideos;
}

function parseVideoResponse(video: youtube_v3.Schema$Video): YouTubeVideoInfo {
  const snippet = video.snippet;
  const contentDetails = video.contentDetails;
  const status = video.status;
  const statistics = video.statistics;

  // Parse region restrictions
  const blockedRegions = contentDetails?.regionRestriction?.blocked || [];
  const allowedRegions = contentDetails?.regionRestriction?.allowed || [];

  return {
    id: video.id!,
    title: snippet?.title || 'Unknown',
    description: snippet?.description || undefined,
    publishedAt: snippet?.publishedAt
      ? new Date(snippet.publishedAt)
      : new Date(),
    thumbnailUrl: snippet?.thumbnails?.medium?.url || undefined,
    duration: contentDetails?.duration || undefined,
    viewCount: statistics?.viewCount
      ? parseInt(statistics.viewCount, 10)
      : undefined,
    likeCount: statistics?.likeCount
      ? parseInt(statistics.likeCount, 10)
      : undefined,
    privacyStatus: status?.privacyStatus || undefined,
    uploadStatus: status?.uploadStatus || undefined,
    license: status?.license || undefined,
    madeForKids: status?.madeForKids || undefined,
    blockedRegions,
    allowedRegions,
  };
}

// Check if a video has potential copyright issues based on available data
export function detectPotentialIssues(
  currentVideo: YouTubeVideoInfo,
  previousVideo?: Partial<YouTubeVideoInfo>
): {
  hasIssues: boolean;
  changes: string[];
} {
  const changes: string[] = [];

  if (!previousVideo) {
    // First sync - check for existing restrictions
    if (currentVideo.blockedRegions.length > 0) {
      changes.push(
        `Video is blocked in ${currentVideo.blockedRegions.length} regions`
      );
    }
    return { hasIssues: changes.length > 0, changes };
  }

  // Check for new region blocks
  const newBlockedRegions = currentVideo.blockedRegions.filter(
    (r) => !previousVideo.blockedRegions?.includes(r)
  );
  if (newBlockedRegions.length > 0) {
    changes.push(
      `New region blocks: ${newBlockedRegions.join(', ')}`
    );
  }

  // Check for upload status changes (rejected, deleted)
  if (
    previousVideo.uploadStatus === 'processed' &&
    currentVideo.uploadStatus !== 'processed'
  ) {
    changes.push(
      `Upload status changed from processed to ${currentVideo.uploadStatus}`
    );
  }

  // Check for privacy status changes
  if (
    previousVideo.privacyStatus === 'public' &&
    currentVideo.privacyStatus !== 'public'
  ) {
    changes.push(
      `Privacy status changed from public to ${currentVideo.privacyStatus}`
    );
  }

  return { hasIssues: changes.length > 0, changes };
}
