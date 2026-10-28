import { OgiriHistory } from '@/components/game/Ogiri/OgiriHistory';
export const metadata = {
  title: '過去のゲーム · 大喜利王',
  robots: { index: false, follow: false },
  referrer: 'no-referrer' as const,
};
export default function Page() {
  return <OgiriHistory />;
}
