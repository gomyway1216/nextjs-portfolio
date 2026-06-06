import type { Metadata } from 'next';
import CsLearningLabHome from '@/components/study/cs/CsLearningLabHome';

export const metadata: Metadata = {
  title: 'CS Learning Lab | Study',
  description: 'Interactive computer science lessons for algorithms and cryptography.',
};

export default function CsLearningLabPage() {
  return <CsLearningLabHome />;
}
