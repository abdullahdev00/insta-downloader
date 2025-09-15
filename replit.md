# Instagram Downloader - Ultimate UI/UX Experience

## Overview

This is an Instagram content downloader application with a premium, Instagram-inspired design. The application allows users to download Instagram posts, reels, stories, and IGTV videos through a visually stunning interface featuring glassmorphism effects, gradient designs, and modern UI components. Built with React, TypeScript, Express.js, and a focus on exceptional user experience.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript for type safety and better developer experience
- **Styling**: Tailwind CSS with custom design system inspired by Instagram's visual language
- **UI Components**: Radix UI primitives with shadcn/ui component library for consistent, accessible components
- **State Management**: React Query (TanStack Query) for server state management and data fetching
- **Routing**: Wouter for lightweight client-side routing
- **Build Tool**: Vite for fast development and optimized production builds

### Backend Architecture
- **Runtime**: Node.js with Express.js framework
- **Language**: TypeScript for full-stack type safety
- **API Design**: RESTful API with JSON responses and defensive middleware
- **Content Processing**: Puppeteer for web scraping Instagram content with Cheerio for HTML parsing
- **File Handling**: Node.js fs promises for file system operations
- **Error Handling**: Centralized error middleware with proper HTTP status codes

### Data Storage
- **Database**: PostgreSQL with Drizzle ORM for type-safe database operations
- **Schema**: Users and downloads tables with JSON metadata storage
- **Connection**: Neon serverless PostgreSQL database
- **Migrations**: Drizzle Kit for database schema migrations
- **In-Memory Fallback**: Memory storage implementation for development/testing

### Design System
- **Color Palette**: Instagram gradient themes with dark/light mode support
- **Typography**: Inter and DM Sans fonts with hierarchical sizing
- **Components**: Glassmorphism cards, gradient buttons, floating headers
- **Animations**: CSS animations for particle backgrounds, hover effects, and transitions
- **Layout**: Responsive design with mobile-first approach

### Content Processing Pipeline
- **URL Validation**: Instagram URL pattern matching for posts, reels, stories, and IGTV
- **Metadata Extraction**: Puppeteer-based scraping for content metadata, thumbnails, and media URLs
- **Download Management**: Background processing with status tracking (pending, processing, completed, failed)
- **File Storage**: Local file system storage with size tracking and metadata preservation

### Security & Performance
- **Input Validation**: Zod schemas for request validation and type safety
- **CORS**: Configured for cross-origin requests
- **Rate Limiting**: Implicit through processing queue system
- **Error Boundaries**: React error boundaries and server error handling
- **Development Tools**: Hot module replacement, runtime error overlay, and development banner

## External Dependencies

### Core Dependencies
- **@neondatabase/serverless**: Neon PostgreSQL serverless database connection
- **drizzle-orm**: Type-safe ORM for database operations
- **puppeteer**: Headless Chrome browser for web scraping
- **cheerio**: Server-side jQuery-like HTML parsing
- **axios**: HTTP client for external API requests

### UI/UX Libraries
- **@radix-ui/***: Comprehensive set of accessible, unstyled UI primitives
- **@tanstack/react-query**: Powerful data synchronization for React
- **tailwindcss**: Utility-first CSS framework
- **class-variance-authority**: Type-safe variant management for components
- **clsx**: Conditional className utility

### Development Tools
- **vite**: Next-generation frontend build tool
- **tsx**: TypeScript execution for Node.js
- **esbuild**: Fast JavaScript bundler for production builds
- **@replit/vite-plugin-runtime-error-modal**: Development error handling
- **@replit/vite-plugin-cartographer**: Development tooling for Replit environment

### Form & Validation
- **react-hook-form**: Performant forms library
- **@hookform/resolvers**: Validation resolvers for react-hook-form
- **zod**: TypeScript-first schema validation

### Additional Utilities
- **date-fns**: Modern JavaScript date utility library
- **connect-pg-simple**: PostgreSQL session store
- **wouter**: Minimalist routing for React
- **cmdk**: Command menu component