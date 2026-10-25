import type { Metadata } from 'next';
import StarcatGuide from '@/components/game/StarcatCaravan/StarcatGuide';

export const metadata: Metadata = {
  title: '星ねこキャラバン 冒険ガイド',
  description: '見下ろしマップの探索・六つの灯火の物語・宝箱・出撃と手動スキル・属性連携・育成・アカウント保存のしくみ。',
  alternates: { canonical: '/games/starcat-caravan/guide' },
};

export default function StarcatGuidePage() { return <StarcatGuide />; }
