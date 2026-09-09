import type { Metadata } from 'next';
import LearningLibrary from '@/components/study/LearningLibrary';

export const metadata: Metadata = {
  title: 'Learning Library',
  description: 'Private learning notes, vocabulary, diagrams and review across engineering, English, finance and society.',
  robots: { index: false, follow: false },
  alternates: { canonical: '/study/learning' },
};

export default function LearningPage() { return <LearningLibrary />; }
