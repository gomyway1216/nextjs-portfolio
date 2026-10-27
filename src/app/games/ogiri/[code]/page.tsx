import { OgiriRoom } from '@/components/game/Ogiri/Ogiri';
export const metadata = { title: '大喜利王 · 参加ルーム', robots: { index: false, follow: false } };
export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  return <OgiriRoom code={(await params).code.toUpperCase()} />;
}
