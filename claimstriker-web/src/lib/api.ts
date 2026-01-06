const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

class ApiClient {
  private token: string | null = null;

  setToken(token: string | null) {
    this.token = token;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers,
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'An error occurred');
    }

    return data;
  }

  // Auth
  async register(email: string, password: string, name?: string) {
    return this.request<ApiResponse<{ token: string; user: any }>>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
    });
  }

  async login(email: string, password: string) {
    return this.request<ApiResponse<{ token: string; user: any }>>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  async getMe() {
    return this.request<ApiResponse<any>>('/auth/me');
  }

  // YouTube OAuth
  async getYouTubeAuthUrl() {
    return this.request<ApiResponse<{ url: string }>>('/auth/youtube/url');
  }

  async linkYouTubeChannel(code: string, state: string) {
    return this.request<ApiResponse<any>>('/auth/youtube/callback', {
      method: 'POST',
      body: JSON.stringify({ code, state }),
    });
  }

  // Channels
  async getChannels() {
    return this.request<ApiResponse<any[]>>('/channels');
  }

  async getChannel(channelId: string) {
    return this.request<ApiResponse<any>>(`/channels/${channelId}`);
  }

  async syncChannel(channelId: string) {
    return this.request<ApiResponse<any>>(`/channels/${channelId}/sync`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  }

  async deleteChannel(channelId: string) {
    return this.request<ApiResponse<any>>(`/channels/${channelId}`, {
      method: 'DELETE',
      body: JSON.stringify({}),
    });
  }

  async updateChannelStatus(channelId: string, status: 'ACTIVE' | 'PAUSED') {
    return this.request<ApiResponse<any>>(`/channels/${channelId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  }

  // Videos
  async getVideos(params?: {
    page?: number;
    limit?: number;
    channelId?: string;
    search?: string;
    hasEvents?: boolean;
    videoType?: 'all' | 'short' | 'long';
  }) {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', params.page.toString());
    if (params?.limit) searchParams.set('limit', params.limit.toString());
    if (params?.channelId) searchParams.set('channelId', params.channelId);
    if (params?.search) searchParams.set('search', params.search);
    if (params?.hasEvents !== undefined) searchParams.set('hasEvents', params.hasEvents.toString());
    if (params?.videoType && params.videoType !== 'all') searchParams.set('videoType', params.videoType);

    const query = searchParams.toString();
    return this.request<PaginatedResponse<any>>(`/videos${query ? `?${query}` : ''}`);
  }

  async getVideo(videoId: string) {
    return this.request<ApiResponse<any>>(`/videos/${videoId}`);
  }

  // Events
  async getEventsSummary() {
    return this.request<ApiResponse<{
      activeStrikes: number;
      activeClaims: number;
      pendingDisputes: number;
      claimsLast30Days: number;
      channelCount: number;
      videoCount: number;
    }>>('/events/summary');
  }

  async getEvents(params?: {
    page?: number;
    limit?: number;
    channelId?: string;
    videoId?: string;
    type?: string;
    status?: string;
  }) {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', params.page.toString());
    if (params?.limit) searchParams.set('limit', params.limit.toString());
    if (params?.channelId) searchParams.set('channelId', params.channelId);
    if (params?.videoId) searchParams.set('videoId', params.videoId);
    if (params?.type) searchParams.set('type', params.type);
    if (params?.status) searchParams.set('status', params.status);

    const query = searchParams.toString();
    return this.request<PaginatedResponse<any>>(`/events${query ? `?${query}` : ''}`);
  }

  async getEvent(eventId: string) {
    return this.request<ApiResponse<any>>(`/events/${eventId}`);
  }

  async getEventsTimeline(days?: number) {
    const query = days ? `?days=${days}` : '';
    return this.request<ApiResponse<any[]>>(`/events/timeline${query}`);
  }

  async updateEventStatus(eventId: string, status: string) {
    return this.request<ApiResponse<any>>(`/events/${eventId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  }

  // Claim sync
  async syncChannelClaims(channelId: string, fullSync?: boolean) {
    const query = fullSync ? '?fullSync=true' : '';
    return this.request<ApiResponse<any>>(`/channels/${channelId}/sync-claims${query}`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  }

  // Admin
  async getAdminStats() {
    return this.request<ApiResponse<{
      totalUsers: number;
      totalChannels: number;
      totalVideos: number;
      totalEvents: number;
      usersByRole: Record<string, number>;
      recentUsers: number;
    }>>('/admin/stats');
  }

  async getAdminUsers(params?: {
    page?: number;
    limit?: number;
    search?: string;
  }) {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', params.page.toString());
    if (params?.limit) searchParams.set('limit', params.limit.toString());
    if (params?.search) searchParams.set('search', params.search);

    const query = searchParams.toString();
    return this.request<ApiResponse<{
      users: AdminUser[];
      pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
      };
    }>>(`/admin/users${query ? `?${query}` : ''}`);
  }

  async getAdminUser(userId: string) {
    return this.request<ApiResponse<AdminUserDetail>>(`/admin/users/${userId}`);
  }

  async updateAdminUser(userId: string, data: { name?: string; emailVerified?: boolean }) {
    return this.request<ApiResponse<any>>(`/admin/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async updateAdminUserRole(userId: string, role: 'USER' | 'ADMIN' | 'SUPER_ADMIN') {
    return this.request<ApiResponse<any>>(`/admin/users/${userId}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    });
  }

  async deleteAdminUser(userId: string) {
    return this.request<ApiResponse<any>>(`/admin/users/${userId}`, {
      method: 'DELETE',
    });
  }

  async getAdminChannels(params?: {
    page?: number;
    limit?: number;
    search?: string;
  }) {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', params.page.toString());
    if (params?.limit) searchParams.set('limit', params.limit.toString());
    if (params?.search) searchParams.set('search', params.search);

    const query = searchParams.toString();
    return this.request<ApiResponse<{
      channels: AdminChannel[];
      pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
      };
    }>>(`/admin/channels${query ? `?${query}` : ''}`);
  }
}

// Admin types
export interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  role: 'USER' | 'ADMIN' | 'SUPER_ADMIN';
  emailVerified: boolean;
  createdAt: string;
  channelCount: number;
  hasPartnerAccess: boolean;
}

export interface AdminUserDetail extends AdminUser {
  updatedAt: string;
  permissions: string[];
  channels: {
    id: string;
    title: string;
    youtubeChannelId: string;
    thumbnailUrl: string | null;
    subscriberCount: number;
    videoCount: number;
    isPartner: boolean;
    status: string;
    lastSyncAt: string | null;
    createdAt: string;
  }[];
  _count: {
    channels: number;
    disputes: number;
  };
}

export interface AdminChannel {
  id: string;
  youtubeChannelId: string;
  title: string;
  thumbnailUrl: string | null;
  subscriberCount: number;
  videoCount: number;
  isPartner: boolean;
  status: string;
  lastSyncAt: string | null;
  createdAt: string;
  syncedVideoCount: number;
  user: {
    id: string;
    email: string;
    name: string | null;
  };
}

export const api = new ApiClient();
