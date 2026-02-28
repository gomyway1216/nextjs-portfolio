import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Settli - グループ精算をスマートに',
  description: 'グループ旅行や飲み会の精算を簡単に。最適な支払い方法を自動計算。ログイン不要、無料で使えます。',
  openGraph: {
    title: 'Settli - グループ精算をスマートに',
    description: 'グループ旅行や飲み会の精算を簡単に。最適な支払い方法を自動計算。',
  },
};

export default function SettliLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      {children}
    </div>
  );
}
