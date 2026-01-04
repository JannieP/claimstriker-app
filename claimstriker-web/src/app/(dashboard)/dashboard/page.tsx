'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AlertTriangle,
  ShieldAlert,
  FileWarning,
  TrendingUp,
  Youtube,
  Video,
  ArrowRight,
} from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function DashboardPage() {
  const { data: summary, isLoading } = useQuery({
    queryKey: ['events-summary'],
    queryFn: () => api.getEventsSummary(),
    refetchInterval: 60000, // Refetch every minute
  });

  const { data: recentEvents } = useQuery({
    queryKey: ['recent-events'],
    queryFn: () => api.getEvents({ limit: 5 }),
  });

  const stats = summary?.data;

  const statCards = [
    {
      title: 'Active Strikes',
      value: stats?.activeStrikes ?? 0,
      icon: ShieldAlert,
      color: 'text-red-600',
      bgColor: 'bg-red-50',
      description: 'Urgent attention required',
    },
    {
      title: 'Active Claims',
      value: stats?.activeClaims ?? 0,
      icon: FileWarning,
      color: 'text-amber-600',
      bgColor: 'bg-amber-50',
      description: 'Review and dispute if needed',
    },
    {
      title: 'Claims (30 days)',
      value: stats?.claimsLast30Days ?? 0,
      icon: TrendingUp,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
      description: 'Recent activity',
    },
    {
      title: 'Pending Disputes',
      value: stats?.pendingDisputes ?? 0,
      icon: AlertTriangle,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
      description: 'In progress',
    },
  ];

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="animate-pulse space-y-3">
                  <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                  <div className="h-8 bg-gray-200 rounded w-1/4"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Youtube className="h-4 w-4" />
          <span>{stats?.channelCount ?? 0} channels</span>
          <span className="mx-2">|</span>
          <Video className="h-4 w-4" />
          <span>{stats?.videoCount ?? 0} videos</span>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <Card key={stat.title}>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className={`p-3 rounded-lg ${stat.bgColor}`}>
                  <stat.icon className={`h-6 w-6 ${stat.color}`} />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{stat.title}</p>
                  <p className="text-2xl font-bold">{stat.value}</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {stat.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Actions */}
      {stats?.channelCount === 0 && (
        <Card className="border-dashed">
          <CardContent className="p-6 text-center">
            <Youtube className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">
              Connect Your First Channel
            </h3>
            <p className="text-muted-foreground mb-4">
              Link your YouTube channel to start monitoring for copyright claims
              and strikes.
            </p>
            <Button asChild>
              <Link href="/dashboard/channels">
                Connect YouTube Channel
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Recent Events */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Recent Events</CardTitle>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/dashboard/events">
              View all
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {recentEvents?.data && recentEvents.data.length > 0 ? (
            <div className="space-y-4">
              {recentEvents.data.map((event: any) => (
                <div
                  key={event.id}
                  className="flex items-center gap-4 p-3 rounded-lg bg-gray-50"
                >
                  <div
                    className={`p-2 rounded-full ${
                      event.type === 'STRIKE'
                        ? 'bg-red-100'
                        : event.type === 'CLAIM'
                          ? 'bg-amber-100'
                          : 'bg-blue-100'
                    }`}
                  >
                    {event.type === 'STRIKE' ? (
                      <ShieldAlert
                        className={`h-4 w-4 ${
                          event.type === 'STRIKE'
                            ? 'text-red-600'
                            : 'text-amber-600'
                        }`}
                      />
                    ) : (
                      <FileWarning className="h-4 w-4 text-amber-600" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {event.video?.title || 'Unknown Video'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {event.type} - {event.status}
                      {event.claimant && ` by ${event.claimant.name}`}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/dashboard/events?id=${event.id}`}>View</Link>
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No copyright events detected yet</p>
              <p className="text-sm">We&apos;ll notify you when something comes up</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
