'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Image from 'next/image';
import Link from 'next/link';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  AlertTriangle,
  ShieldAlert,
  FileWarning,
  DollarSign,
  Globe,
  ChevronLeft,
  ChevronRight,
  Video,
  ExternalLink,
} from 'lucide-react';

const eventTypes = [
  { value: undefined, label: 'All Types' },
  { value: 'CLAIM', label: 'Claims' },
  { value: 'STRIKE', label: 'Strikes' },
  { value: 'MONETIZATION_CHANGE', label: 'Monetization' },
  { value: 'REGION_RESTRICTION', label: 'Region Blocks' },
];

const eventStatuses = [
  { value: undefined, label: 'All Statuses' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'RESOLVED', label: 'Resolved' },
  { value: 'DISPUTED', label: 'Disputed' },
  { value: 'EXPIRED', label: 'Expired' },
];

export default function EventsPage() {
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState<string | undefined>(undefined);
  const [statusFilter, setStatusFilter] = useState<string | undefined>(
    undefined
  );

  const { data: events, isLoading } = useQuery({
    queryKey: ['events', page, typeFilter, statusFilter],
    queryFn: () =>
      api.getEvents({
        page,
        limit: 20,
        type: typeFilter,
        status: statusFilter,
      }),
  });

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'STRIKE':
        return <ShieldAlert className="h-5 w-5 text-red-600" />;
      case 'CLAIM':
        return <FileWarning className="h-5 w-5 text-amber-600" />;
      case 'MONETIZATION_CHANGE':
        return <DollarSign className="h-5 w-5 text-blue-600" />;
      case 'REGION_RESTRICTION':
        return <Globe className="h-5 w-5 text-purple-600" />;
      default:
        return <AlertTriangle className="h-5 w-5 text-gray-600" />;
    }
  };

  const getEventBgColor = (type: string) => {
    switch (type) {
      case 'STRIKE':
        return 'bg-red-50';
      case 'CLAIM':
        return 'bg-amber-50';
      case 'MONETIZATION_CHANGE':
        return 'bg-blue-50';
      case 'REGION_RESTRICTION':
        return 'bg-purple-50';
      default:
        return 'bg-gray-50';
    }
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      ACTIVE: 'bg-red-100 text-red-700',
      RESOLVED: 'bg-green-100 text-green-700',
      DISPUTED: 'bg-amber-100 text-amber-700',
      EXPIRED: 'bg-gray-100 text-gray-700',
      WITHDRAWN: 'bg-blue-100 text-blue-700',
    };
    return colors[status] || 'bg-gray-100 text-gray-700';
  };

  const pagination = events?.pagination;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Copyright Events</h1>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="flex gap-2">
          {eventTypes.map((type) => (
            <Button
              key={type.label}
              variant={typeFilter === type.value ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                setTypeFilter(type.value);
                setPage(1);
              }}
            >
              {type.label}
            </Button>
          ))}
        </div>
        <div className="flex gap-2">
          {eventStatuses.map((status) => (
            <Button
              key={status.label}
              variant={statusFilter === status.value ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                setStatusFilter(status.value);
                setPage(1);
              }}
            >
              {status.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Events List */}
      {isLoading ? (
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="animate-pulse flex gap-4">
                  <div className="w-10 h-10 bg-gray-200 rounded-full"></div>
                  <div className="flex-1 space-y-3">
                    <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                    <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : events?.data && events.data.length > 0 ? (
        <>
          <div className="space-y-4">
            {events.data.map((event: any) => (
              <Card key={event.id}>
                <CardContent className="p-4">
                  <div className="flex gap-4">
                    <div
                      className={`p-3 rounded-full ${getEventBgColor(event.type)}`}
                    >
                      {getEventIcon(event.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="font-medium">
                              {event.type.replace('_', ' ')}
                            </h3>
                            <span
                              className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusBadge(event.status)}`}
                            >
                              {event.status}
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">
                            {event.video?.title || 'Unknown Video'}
                          </p>
                          {event.claimant && (
                            <p className="text-sm text-muted-foreground">
                              Claimed by: {event.claimant.name}
                            </p>
                          )}
                          {event.explanation && (
                            <p className="text-sm mt-2 p-2 bg-gray-50 rounded">
                              {event.explanation}
                            </p>
                          )}
                        </div>
                        {event.video?.thumbnailUrl && (
                          <Image
                            src={event.video.thumbnailUrl}
                            alt={event.video.title}
                            width={120}
                            height={68}
                            className="rounded hidden sm:block"
                          />
                        )}
                      </div>
                      <div className="flex items-center justify-between mt-4 pt-3 border-t">
                        <div className="text-xs text-muted-foreground">
                          Detected: {formatDateTime(event.detectedAt)}
                          {event.resolvedAt && (
                            <span>
                              {' '}
                              | Resolved: {formatDateTime(event.resolvedAt)}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {event.video?.youtubeVideoId && (
                            <Button variant="ghost" size="sm" asChild>
                              <a
                                href={`https://www.youtube.com/watch?v=${event.video.youtubeVideoId}`}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <ExternalLink className="h-4 w-4 mr-1" />
                                YouTube
                              </a>
                            </Button>
                          )}
                          {event.status === 'ACTIVE' && (
                            <Button variant="outline" size="sm">
                              Dispute
                            </Button>
                          )}
                        </div>
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
                {pagination.total} events
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
            <AlertTriangle className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No Events Found</h3>
            <p className="text-muted-foreground max-w-md mx-auto">
              {typeFilter || statusFilter
                ? 'No events match your current filters'
                : 'No copyright events have been detected yet. We will notify you when something comes up.'}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
