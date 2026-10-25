import type { Metadata } from 'next';
import StarcatGuide from '@/components/game/StarcatCaravan/StarcatGuide';

export const metadata: Metadata = {
  title: '星ねこキャラバン 冒険ガイド',
  description: '5属性の連携・固有能力・防御力・自由な編成・敵・召喚と育成・アカウント保存のしくみ。',
  alternates: { canonical: '/games/starcat-caravan/guide' },
};

export default function StarcatGuidePage() { return <StarcatGuide />; }
