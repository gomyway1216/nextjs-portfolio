import type { Metadata } from 'next';
import StudyDocuments from '@/components/study/StudyDocuments';
export const metadata: Metadata = {title: 'Course documents | Learning Library', robots: {index: false, follow: false}, referrer: 'no-referrer'};
export default function DocumentsPage() {return <StudyDocuments />;}
