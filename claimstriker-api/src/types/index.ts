import type { FastifyRequest } from 'fastify';

// JWT Payload
export interface JWTPayload {
  userId: string;
  email: string;
  role: 'USER' | 'ADMIN' | 'SUPER_ADMIN';
  iat?: number;
  exp?: number;
}

// Authenticated Request
export interface AuthenticatedRequest extends FastifyRequest {
  user: JWTPayload;
}

// API Response Types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Auth DTOs
export interface RegisterDTO {
  email: string;
  password: string;
  name?: string;
}

export interface LoginDTO {
  email: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  user: {
    id: string;
    email: string;
    name: string | null;
  };
}

// YouTube Types
export interface YouTubeTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

export interface YouTubeChannelInfo {
  id: string;
  title: string;
  description?: string;
  thumbnailUrl?: string;
  subscriberCount?: number;
  videoCount?: number;
}

export interface YouTubeVideoInfo {
  id: string;
  title: string;
  description?: string;
  publishedAt: Date;
  thumbnailUrl?: string;
  duration?: string;
  viewCount?: number;
  likeCount?: number;
  privacyStatus?: string;
  uploadStatus?: string;
  license?: string;
  monetizationStatus?: string;
  madeForKids?: boolean;
  blockedRegions?: string[];
  allowedRegions?: string[];
}

// Dashboard Summary
export interface DashboardSummary {
  activeStrikes: number;
  activeClaims: number;
  pendingDisputes: number;
  claimsLast30Days: number;
  channelCount: number;
  videoCount: number;
}

// Event Filters
export interface EventFilters {
  channelId?: string;
  videoId?: string;
  type?: string;
  status?: string;
  claimantId?: string;
  startDate?: Date;
  endDate?: Date;
}

// Pagination
export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: JWTPayload;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JWTPayload;
    user: JWTPayload;
  }
}
