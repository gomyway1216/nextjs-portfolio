import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Settli - Smart Group Settlement',
  description: 'Simplify trip and event bill splitting. Automatically calculate optimized settlements. Free and no login required.',
  openGraph: {
    title: 'Settli - Smart Group Settlement',
    description: 'Simplify trip and event bill splitting with optimized settlement calculations.',
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
