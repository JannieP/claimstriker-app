# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ClaimStriker is a SaaS platform for YouTube creators to monitor and manage copyright claims and strikes. It consists of two separate applications:

- **claimstriker-api** - Fastify backend with BullMQ workers
- **claimstriker-web** - Next.js 14 frontend

## Build & Development Commands

### Backend (claimstriker-api)

```bash
cd claimstriker-api

# Install dependencies
npm install

# Generate Prisma client
npm run db:generate

# Run database migrations
npm run db:migrate

# Start development server (port 3001)
npm run dev

# Start background workers
npm run worker

# Type check
npm run typecheck

# Open Prisma Studio
npm run db:studio
```

### Frontend (claimstriker-web)

```bash
cd claimstriker-web

# Install dependencies
npm install

# Start development server (port 3000)
npm run dev

# Build for production
npm run build

# Type check
npm run typecheck
```

## Architecture

### Backend Structure

```
claimstriker-api/
├── src/
│   ├── index.ts           # Fastify server entry point
│   ├── config/            # Environment, database, redis config
│   ├── routes/            # API route handlers (auth, channels, videos, events, youtube)
│   ├── workers/           # BullMQ job processors
│   │   ├── queue.ts       # Queue definitions
│   │   ├── channelSync.ts # Syncs videos from YouTube
│   │   ├── claimDetect.ts # Detects copyright events
│   │   └── notification.ts # Sends notifications
│   ├── lib/
│   │   ├── youtube/       # YouTube API integration
│   │   └── encryption.ts  # AES-256-GCM for token storage
│   └── types/             # TypeScript type definitions
└── prisma/
    └── schema.prisma      # Database schema
```

### Frontend Structure

```
claimstriker-web/
├── src/
│   ├── app/
│   │   ├── (auth)/        # Login/register pages
│   │   ├── (dashboard)/   # Protected dashboard pages
│   │   └── api/           # API routes
│   ├── components/
│   │   ├── ui/            # Base UI components (button, card, input, etc.)
│   │   └── dashboard/     # Dashboard-specific components
│   └── lib/
│       ├── api.ts         # API client for backend
│       └── utils.ts       # Utility functions
```

### Key Data Flow

1. User links YouTube channel via OAuth
2. Scheduler queues `channel-sync` jobs every 4 hours
3. `channelSync` worker fetches videos and queues `claim-detect` jobs
4. `claimDetect` worker checks for changes (region blocks, status changes)
5. Changes create `CopyrightEvent` records and trigger notifications

### Database Models

Core entities: `User`, `Channel`, `Video`, `CopyrightEvent`, `Claimant`, `Dispute`, `Notification`

Tokens are encrypted with AES-256-GCM before storage.

## Environment Setup

1. Copy `.env.example` to `.env` in both directories
2. Set up PostgreSQL database
3. Set up Redis for job queues
4. Configure Google OAuth credentials in Google Cloud Console
5. Run `npm run db:migrate` in the API directory

## Tech Stack

- **Backend**: Fastify, Prisma, BullMQ, googleapis
- **Frontend**: Next.js 14 (App Router), React Query, Tailwind CSS, Radix UI
- **Database**: PostgreSQL
- **Queue**: Redis + BullMQ
- **AI**: OpenAI + Anthropic (with fallback)
