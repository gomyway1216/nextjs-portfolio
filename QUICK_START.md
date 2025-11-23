# Quick Start Guide - Next.js Portfolio

## ✅ Migration Complete!

Your portfolio has been successfully migrated from Create React App to Next.js 14 with TypeScript and App Router.

## Project Location

```
/Users/yudaiyaguchi/Desktop/projects/Yudai-new-portfolio-/nextjs-portfolio/
```

## What's Inside

```
nextjs-portfolio/
├── src/
│   ├── app/              # Next.js App Router pages (18 routes)
│   ├── components/       # All React components (38 files)
│   ├── lib/              # Firebase API & utilities
│   ├── providers/        # Context providers (Auth, Posts)
│   ├── types/            # TypeScript declarations
│   └── assets/           # SCSS styles
├── public/               # Static assets (images)
├── .env.local            # Environment variables (configured)
├── next.config.ts        # Next.js configuration
└── package.json          # Dependencies
```

## Running the Project

### 1. Navigate to the Next.js project:
```bash
cd nextjs-portfolio
```

### 2. Start the development server:
```bash
npm run dev
```

### 3. Open in browser:
```
http://localhost:3000
```

## Available Scripts

```bash
npm run dev      # Start development server
npm run build    # Build for production
npm start        # Run production build
npm run lint     # Run ESLint
```

## Routes Migrated

All 18 routes from your CRA app are now available:

- `/` - Home page
- `/signin` - Authentication
- `/admin` - Admin dashboard (protected)
- `/blog/[category]` - Blog categories
- `/blog/[category]/[id]` - Individual posts
- `/blog/[category]/[id]/edit` - Edit posts (protected)
- `/new-post` - Create post (protected)
- `/new-project` - Create project (protected)
- `/project/[id]/edit` - Edit project (protected)
- `/voice-chat` - Voice chat interface
- `/voice-task` - Task management
- `/voice-task/create-list` - Create task list
- `/voice-task/[id]` - Individual task
- `/achievements` - Achievements (protected)

## Environment Variables

Your `.env.local` file has been created with all necessary Firebase configuration variables.

**Format changed:**
- CRA: `REACT_APP_API_KEY`
- Next.js: `NEXT_PUBLIC_API_KEY`

All variables have been automatically converted!

## Deployment to Vercel

### Option 1: Vercel CLI
```bash
npm install -g vercel
vercel
```

### Option 2: GitHub Integration
1. Push your code to GitHub
2. Go to [vercel.com](https://vercel.com)
3. Import your repository
4. Vercel will auto-detect Next.js and deploy!

**Important:** Set your environment variables in Vercel dashboard:
- Go to Project Settings → Environment Variables
- Add all `NEXT_PUBLIC_*` variables from `.env.local`

## Key Features

✅ **TypeScript** - Full type safety
✅ **App Router** - Modern Next.js routing
✅ **Server Components** - Better performance
✅ **Image Optimization** - Automatic optimization
✅ **Code Splitting** - Automatic lazy loading
✅ **SEO Ready** - Server-side rendering capable
✅ **Firebase** - Fully configured
✅ **Protected Routes** - Middleware for auth
✅ **SCSS Support** - All styles migrated

## Comparing with CRA

| Feature | CRA (old) | Next.js (new) |
|---------|-----------|---------------|
| Dev Server | `npm start` | `npm run dev` |
| Port | 3000 | 3000 |
| Routing | React Router | App Router (file-based) |
| Build | `npm run build` | `npm run build` |
| Environment | `.env` with REACT_APP_* | `.env.local` with NEXT_PUBLIC_* |

## Common Tasks

### Adding a New Page
Create a new folder in `src/app/`:
```typescript
// src/app/my-page/page.tsx
'use client';

export default function MyPage() {
  return <div>My New Page</div>;
}
```

### Using Server Components
Remove 'use client' directive:
```typescript
// src/app/my-page/page.tsx
// No 'use client' = server component!

export default function MyPage() {
  return <div>Server Component</div>;
}
```

### Fetching Data
```typescript
// Client component
'use client';
import { useEffect, useState } from 'react';

// Server component (recommended)
async function getData() {
  const res = await fetch('...');
  return res.json();
}

export default async function Page() {
  const data = await getData();
  return <div>{data.title}</div>;
}
```

## Troubleshooting

### Port Already in Use
```bash
# Kill process on port 3000
lsof -ti:3000 | xargs kill -9
```

### TypeScript Errors
```bash
# Regenerate types
rm -rf .next
npm run dev
```

### Module Not Found
Check import paths use `@/` alias:
```typescript
import Component from '@/components/Component';
import { api } from '@/lib/firebase/api';
```

## Documentation

- [Next.js Docs](https://nextjs.org/docs)
- [App Router Guide](https://nextjs.org/docs/app)
- [Deployment Guide](https://nextjs.org/docs/deployment)
- [ROUTING_STRUCTURE.md](./ROUTING_STRUCTURE.md) - Detailed routing info

## Original CRA Project

Your original Create React App is still in the parent directory:
```
../  (CRA project - unchanged)
```

You can safely delete it once you've verified everything works in Next.js.

---

**Ready to start?** Run `npm run dev` and open http://localhost:3000!
