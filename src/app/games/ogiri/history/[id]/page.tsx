import { OgiriHistory } from '@/components/game/Ogiri/OgiriHistory';
export const metadata = {
  title: 'ゲームの記録 · 大喜利王',
  robots: { index: false, follow: false },
  referrer: 'no-referrer' as const,
};
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <OgiriHistory key={id} id={id} />;
}
