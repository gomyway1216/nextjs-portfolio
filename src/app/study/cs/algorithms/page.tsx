import type { Metadata } from 'next';
import { SortingOverview } from '@/components/study/cs/SortingOverview';

export const metadata: Metadata = {
  title: 'Algorithms | CS Learning Lab',
  description: 'Interactive algorithm lessons and sorting visualizers.',
};

export default function AlgorithmsPage() {
  return <SortingOverview />;
}
