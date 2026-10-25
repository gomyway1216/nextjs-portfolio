import type { Metadata } from 'next';
import StarcatGuide from '@/components/game/StarcatCaravan/StarcatGuide';

export const metadata: Metadata = {
  title: '星ねこキャラバン 冒険ガイド',
  description: '仲間の役割・編成・敵と属性・召喚と育成・途中結果とアカウント保存のしくみ。',
  alternates: { canonical: '/games/starcat-caravan/guide' },
};

export default function StarcatGuidePage() { return <StarcatGuide />; }
