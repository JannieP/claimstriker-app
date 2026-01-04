'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Image from 'next/image';
import { api } from '@/lib/api';
import { formatDate, formatNumber } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import {
  Youtube,
  RefreshCw,
  Trash2,
  Pause,
  Play,
  CheckCircle,
  AlertCircle,
  Clock,
  Plus,
} from 'lucide-react';

export default function ChannelsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [connecting, setConnecting] = useState(false);

  const { data: channels, isLoading } = useQuery({
    queryKey: ['channels'],
    queryFn: () => api.getChannels(),
  });

  const syncMutation = useMutation({
    mutationFn: (channelId: string) => api.syncChannel(channelId),
    onSuccess: () => {
      toast({
        title: 'Sync started',
        description: 'Your channel will be synced shortly.',
      });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Sync failed',
        description: error.message,
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (channelId: string) => api.deleteChannel(channelId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channels'] });
      toast({
        title: 'Channel removed',
        description: 'The channel has been unlinked from your account.',
      });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Failed to remove channel',
        description: error.message,
      });
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({
      channelId,
      status,
    }: {
      channelId: string;
      status: 'ACTIVE' | 'PAUSED';
    }) => api.updateChannelStatus(channelId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channels'] });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Failed to update status',
        description: error.message,
      });
    },
  });

  const handleConnectYouTube = async () => {
    setConnecting(true);
    try {
      const response = await api.getYouTubeAuthUrl();
      if (response.success && response.data?.url) {
        window.location.href = response.data.url;
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Failed to connect',
        description: error.message,
      });
      setConnecting(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'PAUSED':
        return <Pause className="h-4 w-4 text-amber-600" />;
      case 'ERROR':
      case 'REVOKED':
        return <AlertCircle className="h-4 w-4 text-red-600" />;
      default:
        return <Clock className="h-4 w-4 text-gray-600" />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return 'Active';
      case 'PAUSED':
        return 'Paused';
      case 'ERROR':
        return 'Error';
      case 'REVOKED':
        return 'Reconnect Required';
      default:
        return status;
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Channels</h1>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {[...Array(2)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="animate-pulse space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="h-16 w-16 bg-gray-200 rounded-full"></div>
                    <div className="space-y-2 flex-1">
                      <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                      <div className="h-3 bg-gray-200 rounded w-1/4"></div>
                    </div>
                  </div>
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
        <h1 className="text-2xl font-bold">Channels</h1>
        <Button onClick={handleConnectYouTube} disabled={connecting}>
          <Plus className="h-4 w-4 mr-2" />
          {connecting ? 'Connecting...' : 'Connect Channel'}
        </Button>
      </div>

      {channels?.data && channels.data.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          {channels.data.map((channel: any) => (
            <Card key={channel.id}>
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  {channel.thumbnailUrl ? (
                    <Image
                      src={channel.thumbnailUrl}
                      alt={channel.title}
                      width={64}
                      height={64}
                      className="rounded-full"
                    />
                  ) : (
                    <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                      <Youtube className="h-8 w-8 text-primary" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold truncate">{channel.title}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      {getStatusIcon(channel.status)}
                      <span className="text-sm text-muted-foreground">
                        {getStatusText(channel.status)}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                      <span>
                        {formatNumber(channel.subscriberCount || 0)} subscribers
                      </span>
                      <span>{channel.syncedVideoCount || 0} videos synced</span>
                    </div>
                    {channel.lastSyncAt && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Last synced: {formatDate(channel.lastSyncAt)}
                      </p>
                    )}
                    {channel.lastSyncError && (
                      <p className="text-xs text-red-600 mt-1">
                        {channel.lastSyncError}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-4 pt-4 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => syncMutation.mutate(channel.id)}
                    disabled={
                      syncMutation.isPending || channel.status !== 'ACTIVE'
                    }
                  >
                    <RefreshCw
                      className={`h-4 w-4 mr-2 ${syncMutation.isPending ? 'animate-spin' : ''}`}
                    />
                    Sync Now
                  </Button>
                  {channel.status === 'ACTIVE' ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        statusMutation.mutate({
                          channelId: channel.id,
                          status: 'PAUSED',
                        })
                      }
                      disabled={statusMutation.isPending}
                    >
                      <Pause className="h-4 w-4 mr-2" />
                      Pause
                    </Button>
                  ) : channel.status === 'PAUSED' ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        statusMutation.mutate({
                          channelId: channel.id,
                          status: 'ACTIVE',
                        })
                      }
                      disabled={statusMutation.isPending}
                    >
                      <Play className="h-4 w-4 mr-2" />
                      Resume
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleConnectYouTube}
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Reconnect
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-600 hover:text-red-700 hover:bg-red-50 ml-auto"
                    onClick={() => {
                      if (
                        confirm(
                          'Are you sure you want to remove this channel? This will delete all synced data.'
                        )
                      ) {
                        deleteMutation.mutate(channel.id);
                      }
                    }}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="border-dashed">
          <CardContent className="p-12 text-center">
            <Youtube className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No Channels Connected</h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Connect your YouTube channel to start monitoring for copyright
              claims, strikes, and other issues.
            </p>
            <Button onClick={handleConnectYouTube} disabled={connecting}>
              <Youtube className="h-4 w-4 mr-2" />
              {connecting ? 'Connecting...' : 'Connect YouTube Channel'}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
