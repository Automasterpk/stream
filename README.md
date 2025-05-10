# AutoMaster - Professional Multistreaming Platform

AutoMaster is a complete drag-and-drop + YouTube-link-based multistreaming platform that allows you to stream your content to multiple platforms simultaneously.

## Features

- **Google-only Authentication**: Secure sign-in with Google OAuth, preventing fake emails
- **Modern UI/UX Design**: Clean, premium dashboard with responsive design for all devices
- **Multiple Video Sources**: Upload files or import from YouTube links
- **Auto-Download**: YouTube video processing with yt-dlp
- **Multistreaming**: Stream to multiple platforms using FFmpeg + cron scheduling
- **Subscription Management**: Stripe integration for payments and plan management

## Tech Stack

- **Frontend**: Next.js 14 with App Router, React, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes, Node.js
- **Authentication**: NextAuth.js with Google OAuth
- **Database**: PostgreSQL for relational data
- **Media Processing**: FFmpeg for streaming, yt-dlp for YouTube downloads
- **Payments**: Stripe for subscription management
- **Deployment**: Docker containers for all services

## Getting Started

### Prerequisites

- Node.js 18.x or later
- Docker and Docker Compose (for production)
- PostgreSQL database
- Redis (for caching/queuing)
- FFmpeg installed on the server
- Stripe account for payments
- Google OAuth credentials

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/automaster.git
   cd automaster
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env.local` file based on `.env.example`:
   ```bash
   cp .env.example .env.local
   ```

4. Fill in the environment variables:
   - Google OAuth credentials
   - Stripe API keys
   - Database connection details
   - JWT secret, etc.

5. Run the development server:
   ```bash
   npm run dev
   ```

6. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
automaster/
├── app/               # Next.js app router
│   ├── api/           # API routes
│   ├── auth/          # Authentication pages
│   ├── dashboard/     # User dashboard
│   └── admin/         # Admin dashboard
├── components/        # React components
│   ├── ui/            # UI components
│   └── dashboard/     # Dashboard components
├── lib/               # Utility functions and hooks
├── types/             # TypeScript type definitions
├── public/            # Static assets
└── styles/            # Global styles
```

## Deployment

### Docker Deployment

1. Build the Docker images:
   ```bash
   docker-compose build
   ```

2. Start the containers:
   ```bash
   docker-compose up -d
   ```

### Manual Deployment

1. Build the production version:
   ```bash
   npm run build
   ```

2. Start the production server:
   ```bash
   npm start
   ```

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- [Next.js](https://nextjs.org/)
- [Tailwind CSS](https://tailwindcss.com/)
- [FFmpeg](https://ffmpeg.org/)
- [yt-dlp](https://github.com/yt-dlp/yt-dlp)
- [Stripe](https://stripe.com/)
- [NextAuth.js](https://next-auth.js.org/) 