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
    });
  }

  async deleteChannel(channelId: string) {
    return this.request<ApiResponse<any>>(`/channels/${channelId}`, {
      method: 'DELETE',
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
  }) {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', params.page.toString());
    if (params?.limit) searchParams.set('limit', params.limit.toString());
    if (params?.channelId) searchParams.set('channelId', params.channelId);
    if (params?.search) searchParams.set('search', params.search);
    if (params?.hasEvents !== undefined) searchParams.set('hasEvents', params.hasEvents.toString());

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
}

export const api = new ApiClient();
