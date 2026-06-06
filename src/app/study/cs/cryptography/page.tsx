import type { Metadata } from 'next';
import { CryptoOverview } from '@/components/study/cs/CryptoOverview';

export const metadata: Metadata = {
  title: 'Crypto Lab | CS Learning Lab',
  description: 'Interactive cryptography lessons for ciphers, RSA, key exchange, and hashes.',
};

export default function CryptographyPage() {
  return <CryptoOverview />;
}
