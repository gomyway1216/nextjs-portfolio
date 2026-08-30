This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Project Notes

- Public growth timeline: `/growth` reads the memory service's approved public projection through a server-only request. Configure `PUBLIC_MEMORY_API_URL` in the deployment environment (never use a `NEXT_PUBLIC_` prefix). The endpoint returns `{"items":[{"id":"...","title":"...","summary":"...","category":"...","occurredAt":"2026-01-01T00:00:00Z","tags":["..."]}]}`; unknown fields are discarded before rendering and responses are revalidated hourly.
- Owner memory dashboard: `/memory` requires the existing Firebase administrator session. Configure the server-only `PERSONAL_MEMORY_ADMIN_API_URL` and `PERSONAL_MEMORY_DASHBOARD_READ_KEY` deployment variables; never expose either through a `NEXT_PUBLIC_` variable. The private tab reads compact index metadata and summary-only revision snapshots. Raw evidence stays on the MCP read path, while the public tab continues to use only `PUBLIC_MEMORY_API_URL`.
- Shogi AI implementation details: `SHOGI_AI_IMPROVEMENTS.md`
- Shogi evaluation recovery log: [日本語](docs/blog-shogi-eval-recovery.md) / [English](docs/blog-shogi-eval-recovery.en.md)
- WCSC36 sibling-teacher forensic and retraining log: [日本語](docs/blog-shogi-wcsc36-sibling-training.md) / [English](docs/blog-shogi-wcsc36-sibling-training.en.md)
- WCSC36 policy-exposure audit, exact-row holdout, and training preregistration: [日本語](docs/blog-shogi-wcsc36-sibling-training-results.md) / [English](docs/blog-shogi-wcsc36-sibling-training-results.en.md)
