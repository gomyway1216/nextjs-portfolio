import type { Metadata } from 'next';

// The study index is a client component and can't export metadata itself;
// nested routes (e.g. /study/cs/**) override this with their own exports.
export const metadata: Metadata = {
  title: 'Study Notes',
  description:
    'Structured computer-science study notes and learning articles by Yudai Yaguchi — algorithms, systems, and applied machine learning.',
  alternates: { canonical: '/study' },
  openGraph: {
    title: 'Study Notes | Yudai Yaguchi',
    description:
      'Structured computer-science study notes and learning articles — algorithms, systems, and applied machine learning.',
    url: '/study',
  },
};

export default function StudyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
