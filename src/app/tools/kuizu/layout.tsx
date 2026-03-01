import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Kuizu - Quiz Game',
  description: 'Fun quiz game with solo and multiplayer modes. Test your knowledge across multiple categories with daily challenges.',
  openGraph: {
    title: 'Kuizu - Quiz Game',
    description: 'Fun quiz game with solo and multiplayer modes. Test your knowledge across multiple categories.',
  },
};

export default function KuizuLayout({
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
