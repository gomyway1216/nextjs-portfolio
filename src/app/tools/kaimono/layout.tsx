import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Kaimono - Smart Shopping List',
  description: 'Create and manage shopping lists with budgets, categories, and sharing. Free and no login required.',
  openGraph: {
    title: 'Kaimono - Smart Shopping List',
    description: 'Create and manage shopping lists with budgets, categories, and sharing.',
  },
};

export default function KaimonoLayout({
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
