import type { Metadata } from 'next';
import EditProjectPage from '@/page/editProject/EditProjectPage';

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default function NewProject() {
  return <EditProjectPage />;
}
