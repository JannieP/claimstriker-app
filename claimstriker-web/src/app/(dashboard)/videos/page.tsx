'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import Image from 'next/image';
import Link from 'next/link';
import { api } from '@/lib/api';
import { formatDate, formatNumber } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Video,
  Search,
  ExternalLink,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Filter,
  Code,
  LayoutDashboard,
} from 'lucide-react';

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

export default function VideosPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [channelFilter, setChannelFilter] = useState<string>('');
  const [hasEventsFilter, setHasEventsFilter] = useState<boolean | undefined>(
    undefined
  );
  const [videoTypeFilter, setVideoTypeFilter] = useState<'all' | 'short' | 'long'>('all');
  const [jsonViewIds, setJsonViewIds] = useState<Set<string>>(new Set());
  const [isAdmin, setIsAdmin] = useState(false);

  // Check if user is admin
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      api.setToken(token);
      api.getMe().then((response) => {
        if (response.success && response.data) {
          const role = (response.data as any).role;
          setIsAdmin(role === 'ADMIN' || role === 'SUPER_ADMIN');
        }
      });
    }
  }, []);

  const toggleJsonView = (videoId: string) => {
    setJsonViewIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(videoId)) {
        newSet.delete(videoId);
      } else {
        newSet.add(videoId);
      }
      return newSet;
    });
  };

  // Fetch channels for filter dropdown
  const { data: channelsData } = useQuery({
    queryKey: ['channels'],
    queryFn: () => api.getChannels(),
  });

  const { data: videos, isLoading } = useQuery({
    queryKey: ['videos', page, pageSize, search, channelFilter, hasEventsFilter, videoTypeFilter],
    queryFn: () =>
      api.getVideos({
        page,
        limit: pageSize,
        search: search || undefined,
        channelId: channelFilter || undefined,
        hasEvents: hasEventsFilter,
        videoType: videoTypeFilter,
      }),
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  const handleChannelChange = (channelId: string) => {
    setChannelFilter(channelId);
    setPage(1);
  };

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setPage(1);
  };

  const handleVideoTypeChange = (type: 'all' | 'short' | 'long') => {
    setVideoTypeFilter(type);
    setPage(1);
  };

  const pagination = videos?.pagination;
  const channels = channelsData?.data || [];

  // Reusable Pagination Component
  const PaginationControls = () => {
    if (!pagination || pagination.totalPages <= 1) return null;

    return (
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 py-3 px-4 bg-gray-50 rounded-lg">
        <div className="flex items-center gap-4">
          <p className="text-sm text-muted-foreground">
            Showing {(page - 1) * pagination.limit + 1} to{' '}
            {Math.min(page * pagination.limit, pagination.total)} of{' '}
            {pagination.total} videos
          </p>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Show:</span>
            <select
              value={pageSize}
              onChange={(e) => handlePageSizeChange(Number(e.target.value))}
              className="text-sm border rounded px-2 py-1 bg-white"
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(page - 1)}
            disabled={page === 1}
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>
          <span className="text-sm text-muted-foreground px-2">
            Page {page} of {pagination.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(page + 1)}
            disabled={page === pagination.totalPages}
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Videos</h1>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <form onSubmit={handleSearch} className="flex-1 flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search videos..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button type="submit" variant="secondary">
              Search
            </Button>
          </form>

          {/* Channel Filter */}
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <select
              value={channelFilter}
              onChange={(e) => handleChannelChange(e.target.value)}
              className="text-sm border rounded-md px-3 py-2 bg-white min-w-[180px]"
            >
              <option value="">All Channels</option>
              {channels.map((channel: any) => (
                <option key={channel.id} value={channel.id}>
                  {channel.title}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap gap-4">
          {/* Events Filter */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Events:</span>
            <div className="flex gap-1">
              <Button
                variant={hasEventsFilter === undefined ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setHasEventsFilter(undefined);
                  setPage(1);
                }}
              >
                All
              </Button>
              <Button
                variant={hasEventsFilter === true ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setHasEventsFilter(true);
                  setPage(1);
                }}
              >
                With Events
              </Button>
              <Button
                variant={hasEventsFilter === false ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setHasEventsFilter(false);
                  setPage(1);
                }}
              >
                No Events
              </Button>
            </div>
          </div>

          {/* Video Type Filter */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Type:</span>
            <div className="flex gap-1">
              <Button
                variant={videoTypeFilter === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleVideoTypeChange('all')}
              >
                All
              </Button>
              <Button
                variant={videoTypeFilter === 'long' ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleVideoTypeChange('long')}
              >
                Long Form
              </Button>
              <Button
                variant={videoTypeFilter === 'short' ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleVideoTypeChange('short')}
              >
                Shorts
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Top Pagination */}
      <PaginationControls />

      {/* Videos List */}
      {isLoading ? (
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="animate-pulse flex gap-4">
                  <div className="w-40 h-24 bg-gray-200 rounded"></div>
                  <div className="flex-1 space-y-3">
                    <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                    <div className="h-3 bg-gray-200 rounded w-1/4"></div>
                    <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : videos?.data && videos.data.length > 0 ? (
        <>
          <div className="space-y-4">
            {videos.data.map((video: any) => {
              const isJsonView = jsonViewIds.has(video.id);

              return (
                <Card key={video.id}>
                  <CardContent className="p-4">
                    {/* Admin View Toggle */}
                    {isAdmin && (
                      <div className="flex justify-end mb-3">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleJsonView(video.id)}
                          className="text-xs"
                        >
                          {isJsonView ? (
                            <>
                              <LayoutDashboard className="h-3 w-3 mr-1" />
                              UX View
                            </>
                          ) : (
                            <>
                              <Code className="h-3 w-3 mr-1" />
                              JSON View
                            </>
                          )}
                        </Button>
                      </div>
                    )}

                    {isJsonView ? (
                      /* JSON View */
                      <div className="bg-gray-900 rounded-lg p-4 overflow-auto max-h-[600px]">
                        <pre className="text-xs text-green-400 font-mono whitespace-pre-wrap">
                          {JSON.stringify(video, null, 2)}
                        </pre>
                      </div>
                    ) : (
                      /* UX View */
                      <div className="space-y-4">
                        <div className="flex gap-4">
                          {video.thumbnailUrl ? (
                            <Image
                              src={video.thumbnailUrl}
                              alt={video.title}
                              width={160}
                              height={90}
                              className="rounded object-cover"
                            />
                          ) : (
                            <div className="w-40 h-24 bg-gray-100 rounded flex items-center justify-center">
                              <Video className="h-8 w-8 text-gray-400" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-4">
                              <div className="min-w-0">
                                <h3 className="font-medium truncate">{video.title}</h3>
                                <p className="text-sm text-muted-foreground mt-1">
                                  {video.channel?.title} | Published{' '}
                                  {formatDate(video.publishedAt)}
                                </p>
                              </div>
                              {video.eventCount > 0 && (
                                <div className="flex items-center gap-1 px-2 py-1 bg-amber-50 text-amber-700 rounded text-sm">
                                  <AlertTriangle className="h-4 w-4" />
                                  <span>{video.eventCount} events</span>
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground">
                              <span>{formatNumber(video.viewCount || 0)} views</span>
                              <span className="capitalize">{video.privacyStatus}</span>
                              {video.isShort && (
                                <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs font-medium">
                                  Short
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-3">
                              <Button variant="outline" size="sm" asChild>
                                <a
                                  href={video.youtubeUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  <ExternalLink className="h-4 w-4 mr-2" />
                                  View on YouTube
                                </a>
                              </Button>
                              {video.eventCount > 0 && (
                                <Button variant="outline" size="sm" asChild>
                                  <Link
                                    href={`/events?videoId=${video.id}`}
                                  >
                                    View Events
                                  </Link>
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Event Details */}
                        {video.events && video.events.length > 0 && (
                          <div className="border-t pt-4 mt-4">
                            <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                              <AlertTriangle className="h-4 w-4 text-amber-500" />
                              Copyright Events ({video.events.length})
                            </h4>
                            <div className="space-y-3">
                              {video.events.map((event: any) => (
                                <div
                                  key={event.id}
                                  className="bg-gray-50 rounded-lg p-3 text-sm"
                                >
                                  <div className="flex items-start justify-between gap-4">
                                    <div className="flex-1">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span
                                          className={`px-2 py-0.5 rounded text-xs font-medium ${
                                            event.type === 'CLAIM'
                                              ? 'bg-yellow-100 text-yellow-800'
                                              : event.type === 'STRIKE'
                                                ? 'bg-red-100 text-red-800'
                                                : 'bg-orange-100 text-orange-800'
                                          }`}
                                        >
                                          {event.type}
                                        </span>
                                        <span
                                          className={`px-2 py-0.5 rounded text-xs font-medium ${
                                            event.status === 'ACTIVE'
                                              ? 'bg-red-100 text-red-800'
                                              : event.status === 'RESOLVED'
                                                ? 'bg-green-100 text-green-800'
                                                : event.status === 'DISPUTED'
                                                  ? 'bg-blue-100 text-blue-800'
                                                  : 'bg-gray-100 text-gray-800'
                                          }`}
                                        >
                                          {event.status}
                                        </span>
                                        {event.claimType && (
                                          <span className="text-xs text-muted-foreground">
                                            {event.claimType}
                                          </span>
                                        )}
                                        {event.contentType && (
                                          <span className="text-xs text-muted-foreground">
                                            ({event.contentType})
                                          </span>
                                        )}
                                      </div>
                                      {event.claimant && (
                                        <p className="mt-1 text-muted-foreground">
                                          <span className="font-medium">Claimant:</span>{' '}
                                          {event.claimant.name}
                                          {event.claimant.type && (
                                            <span className="text-xs ml-1">
                                              ({event.claimant.type})
                                            </span>
                                          )}
                                        </p>
                                      )}
                                      {event.claimedContent && (
                                        <p className="mt-1 text-muted-foreground line-clamp-2">
                                          <span className="font-medium">Content:</span>{' '}
                                          {event.claimedContent}
                                        </p>
                                      )}
                                      {event.policyAction && (
                                        <p className="mt-1">
                                          <span className="font-medium">Policy:</span>{' '}
                                          <span className="text-muted-foreground capitalize">{event.policyAction}</span>
                                        </p>
                                      )}
                                      {(event.monetizationImpact || event.viewabilityImpact) && (
                                        <p className="mt-1">
                                          <span className="font-medium">Impact:</span>{' '}
                                          <span className="text-muted-foreground">
                                            {event.monetizationImpact && `Monetization: ${event.monetizationImpact}`}
                                            {event.monetizationImpact && event.viewabilityImpact && ' | '}
                                            {event.viewabilityImpact && `Viewability: ${event.viewabilityImpact}`}
                                          </span>
                                        </p>
                                      )}
                                      {event.affectedRegions && event.affectedRegions.length > 0 && (
                                        <p className="mt-1">
                                          <span className="font-medium">Regions:</span>{' '}
                                          <span className="text-muted-foreground">
                                            {event.affectedRegions.slice(0, 5).join(', ')}
                                            {event.affectedRegions.length > 5 && ` +${event.affectedRegions.length - 5} more`}
                                          </span>
                                        </p>
                                      )}
                                      {event.explanation && (
                                        <p className="mt-1 text-muted-foreground text-xs italic">
                                          {event.explanation}
                                        </p>
                                      )}
                                    </div>
                                    <div className="text-xs text-muted-foreground text-right">
                                      <p>Detected: {formatDate(event.detectedAt)}</p>
                                      {event.resolvedAt && (
                                        <p>Resolved: {formatDate(event.resolvedAt)}</p>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Bottom Pagination */}
          <PaginationControls />
        </>
      ) : (
        <Card className="border-dashed">
          <CardContent className="p-12 text-center">
            <Video className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No Videos Found</h3>
            <p className="text-muted-foreground max-w-md mx-auto">
              {search
                ? `No videos matching "${search}"`
                : channelFilter
                ? 'No videos found for this channel'
                : 'Connect a YouTube channel to see your videos here'}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
