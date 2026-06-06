import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import SortLab from '@/components/study/cs/SortLab';
import { getSortingAlgorithm, sortingAlgorithms } from '@/lib/cs-learning/sorting';

type Params = {
  algorithm: string;
};

export function generateStaticParams(): Params[] {
  return sortingAlgorithms.map((algorithm) => ({ algorithm: algorithm.id }));
}

export const dynamicParams = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { algorithm: algorithmId } = await params;
  const algorithm = getSortingAlgorithm(algorithmId);

  if (!algorithm) return {};

  return {
    title: `${algorithm.name} | CS Learning Lab`,
    description: algorithm.summary,
  };
}

export default async function SortingAlgorithmPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { algorithm: algorithmId } = await params;
  const algorithm = getSortingAlgorithm(algorithmId);

  if (!algorithm) notFound();

  return <SortLab key={algorithm.id} algorithm={algorithm} />;
}
