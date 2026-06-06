import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import CryptoLab from '@/components/study/cs/CryptoLab';
import { cryptoTechniques, getCryptoTechnique } from '@/lib/cs-learning/crypto';

type Params = {
  technique: string;
};

export function generateStaticParams(): Params[] {
  return cryptoTechniques.map((technique) => ({ technique: technique.id }));
}

export const dynamicParams = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { technique: techniqueId } = await params;
  const technique = getCryptoTechnique(techniqueId);

  if (!technique) return {};

  return {
    title: `${technique.name} | CS Learning Lab`,
    description: technique.summary,
  };
}

export default async function CryptoTechniquePage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { technique: techniqueId } = await params;
  const technique = getCryptoTechnique(techniqueId);

  if (!technique) notFound();

  return <CryptoLab key={technique.id} technique={technique} />;
}
