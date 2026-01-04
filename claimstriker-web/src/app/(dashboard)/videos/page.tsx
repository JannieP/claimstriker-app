'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Image from 'next/image';
import Link from 'next/link';
import { api } from '@/lib/api';
import { formatDate, formatNumber, getYouTubeVideoUrl } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Video,
  Search,
  ExternalLink,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

export default function VideosPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [hasEventsFilter, setHasEventsFilter] = useState<boolean | undefined>(
    undefined
  );

  const { data: videos, isLoading } = useQuery({
    queryKey: ['videos', page, search, hasEventsFilter],
    queryFn: () =>
      api.getVideos({
        page,
        limit: 20,
        search: search || undefined,
        hasEvents: hasEventsFilter,
      }),
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  const pagination = videos?.pagination;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Videos</h1>
      </div>

      {/* Filters */}
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
        <div className="flex gap-2">
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
            {videos.data.map((video: any) => (
              <Card key={video.id}>
                <CardContent className="p-4">
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
                              href={`/dashboard/events?videoId=${video.id}`}
                            >
                              View Events
                            </Link>
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Showing {(page - 1) * pagination.limit + 1} to{' '}
                {Math.min(page * pagination.limit, pagination.total)} of{' '}
                {pagination.total} videos
              </p>
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
                <span className="text-sm text-muted-foreground">
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
          )}
        </>
      ) : (
        <Card className="border-dashed">
          <CardContent className="p-12 text-center">
            <Video className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No Videos Found</h3>
            <p className="text-muted-foreground max-w-md mx-auto">
              {search
                ? `No videos matching "${search}"`
                : 'Connect a YouTube channel to see your videos here'}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
