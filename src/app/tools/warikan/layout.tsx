import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'ワリカン - 割り勘計算',
  description: 'グループ旅行や飲み会の割り勘計算を簡単に。最適な精算方法を自動計算します。',
};

export default function WarikanLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto px-4 py-8 max-w-4xl">
        {children}
      </main>
    </div>
  );
}
