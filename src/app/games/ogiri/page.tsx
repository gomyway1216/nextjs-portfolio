import { OgiriLanding } from '@/components/game/Ogiri/Ogiri';
export const metadata = {
  title: 'みんなの大喜利王',
  description: 'スマホで回答、テレビで大笑い。3〜12人で遊べる日本語パーティーゲーム。登録不要。',
  alternates: { canonical: '/games/ogiri' },
};
export default function Page() {
  return <OgiriLanding />;
}
