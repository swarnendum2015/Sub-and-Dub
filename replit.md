# Video Dubbing and Translation Platform

## Overview

This is a full-stack web application for video dubbing and translation. The platform allows users to upload videos, automatically transcribe them in Bengali, translate the content to multiple languages, and generate AI-powered dubbing. The system is built with a modern tech stack including React, Express, and PostgreSQL, with AI/ML integrations for transcription, translation, and voice synthesis.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript
- **Build Tool**: Vite for development and production builds
- **Styling**: Tailwind CSS with shadcn/ui component library
- **State Management**: TanStack Query for server state management
- **Routing**: Wouter for client-side routing
- **UI Components**: Radix UI primitives with custom styling

### Backend Architecture
- **Server**: Express.js with TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **File Storage**: Local file system with multer for uploads
- **API Design**: RESTful endpoints with proper error handling
- **Development**: Hot reloading with Vite integration

### Database Schema
- **Videos**: Stores video metadata, file paths, and processing status
- **Transcriptions**: Stores transcribed text segments with timestamps
- **Translations**: Stores translated text for different target languages
- **Dubbing Jobs**: Manages AI dubbing tasks and output files

## Key Components

### Video Processing Pipeline
1. **Upload**: Video files are uploaded and validated (MP4, MOV, AVI, MKV formats, max 500MB)
2. **Transcription**: Audio extraction using FFmpeg, transcription via ElevenLabs API
3. **Translation**: Multi-model translation using OpenAI, Google Translate, and Azure Translator
4. **Dubbing**: AI voice generation using ElevenLabs Dubbing Studio

### Storage Strategy
- **Database**: PostgreSQL with Drizzle ORM for persistent data storage
- **Schema**: Videos, transcriptions, translations, and dubbing jobs with proper relationships
- **File Management**: Local file system with organized upload directories

### AI/ML Integrations
- **ElevenLabs**: Transcription and voice synthesis
- **OpenAI**: Translation services
- **Google Translate**: Additional translation validation
- **Azure Translator**: Translation confidence scoring

## Data Flow

1. **Video Upload**: User uploads video → Server validates and stores file → Processing job initiated
2. **Transcription**: Video processed → Audio extracted → Transcribed to Bengali → Segments stored
3. **Translation**: Original transcription → Multi-model translation → Confidence scoring → Best translation selected
4. **Dubbing**: Translated text → AI voice generation → Audio file created → Job completed
5. **Workspace**: User accesses transcriptions, translations, and dubbing controls in unified interface

## External Dependencies

### Core Dependencies
- **@neondatabase/serverless**: Database connection for Neon PostgreSQL
- **drizzle-orm**: Type-safe database operations
- **@tanstack/react-query**: Server state management
- **multer**: File upload handling
- **ffmpeg**: Video/audio processing (system dependency)

### AI/ML Services
- **ElevenLabs API**: Transcription and voice synthesis
- **OpenAI API**: Translation services
- **Google Translate API**: Translation validation
- **Azure Translator**: Translation confidence scoring

### Development Tools
- **Vite**: Build tool and development server
- **TypeScript**: Type safety across the stack
- **ESBuild**: Production bundling
- **Tailwind CSS**: Utility-first styling

## Deployment Strategy

### Development
- **Script**: `npm run dev` - Starts development server with hot reloading
- **Port**: Default development setup with Vite dev server
- **Database**: Local PostgreSQL or Neon database connection

### Production
- **Build**: `npm run build` - Creates optimized production bundle
- **Start**: `npm run start` - Runs production server
- **Database**: PostgreSQL with connection pooling
- **File Storage**: Organized upload directories with proper permissions

### Environment Variables
- `DATABASE_URL`: PostgreSQL connection string
- `ELEVENLABS_API_KEY`: ElevenLabs API authentication
- `OPENAI_API_KEY`: OpenAI API authentication
- `GOOGLE_TRANSLATE_API_KEY`: Google Translate API key
- `AZURE_TRANSLATOR_KEY`: Azure Translator API key

## Changelog

```
Changelog:
- July 07, 2025. Initial setup and implementation
  - Created simplified landing page with video upload
  - Built workspace with video player and transcription panel
  - Added support for Bengali → English, Hindi, Tamil, Telugu, Malayalam
  - Integrated OpenAI and ElevenLabs APIs
  - Implemented multi-model translation confidence scoring
  - Created time-synced transcription editing interface

- July 08, 2025. Enhanced processing and error handling
  - Fixed stuck videos processing issue with timeout mechanism (10 min timeout)
  - Added job management endpoints for retry and status fixes
  - Implemented editable transcription panels for Bengali and English
  - Enhanced error handling for API quota issues
  - Added automatic retry functionality for failed videos
  - Improved processing status page with real-time verification
```

## User Preferences

```
Preferred communication style: Simple, everyday language.
Interface preferences: 
- Simple upload page as first screen
- Workspace focused on video + transcription/translation panels
- Minimal space for status and menu items
- Support for Tamil, Telugu, Malayalam in addition to English/Hindi
```