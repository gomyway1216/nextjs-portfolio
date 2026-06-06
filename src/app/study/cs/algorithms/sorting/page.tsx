import type { Metadata } from 'next';
import { SortingOverview } from '@/components/study/cs/SortingOverview';

export const metadata: Metadata = {
  title: 'Sorting Lab | CS Learning Lab',
  description: 'Compare sorting algorithms with step-by-step visualizations.',
};

export default function SortingPage() {
  return <SortingOverview />;
}
