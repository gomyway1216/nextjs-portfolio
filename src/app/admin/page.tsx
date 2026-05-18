import { Suspense } from 'react';
import AdminPage from '@/page/admin/AdminPage';

export default function Admin() {
  return (
    <Suspense fallback={null}>
      <AdminPage />
    </Suspense>
  );
}
