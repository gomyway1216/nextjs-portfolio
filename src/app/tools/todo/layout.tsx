import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Todo - AI Task Manager',
  description: 'Create tasks from screenshots, text, or voice. AI-powered task extraction.',
  openGraph: {
    title: 'Todo - AI Task Manager',
    description: 'Create tasks from screenshots, text, or voice with AI.',
  },
};

export default function TodoLayout({
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
