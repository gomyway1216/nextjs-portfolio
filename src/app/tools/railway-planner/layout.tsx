import type { Metadata } from 'next';

// The page is a client component and can't export metadata itself.
export const metadata: Metadata = {
  title: 'Japan Railway Planner',
  description:
    'Interactive Japan railway route planner — explore lines and stations on a map of Japan and plan routes in the browser.',
  alternates: { canonical: '/tools/railway-planner' },
  openGraph: {
    title: 'Japan Railway Planner | Yudai Yaguchi',
    description:
      'Interactive Japan railway route planner — explore lines and stations on a map of Japan and plan routes in the browser.',
    url: '/tools/railway-planner',
  },
};

export default function RailwayPlannerLayout({ children }: { children: React.ReactNode }) {
  return children;
}
