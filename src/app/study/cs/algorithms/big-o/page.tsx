import type { Metadata } from 'next';
import { BigOComparisonPage } from '@/components/study/cs/BigOComparisonPage';

export const metadata: Metadata = {
  title: 'Big-O Comparison | CS Learning Lab',
  description: 'Compare linear, n log n, and quadratic growth with theoretical samples.',
};

export default function BigOPage() {
  return <BigOComparisonPage />;
}
