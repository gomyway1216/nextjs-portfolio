import AdminViewLogger from '@/components/AdminViewLogger';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AdminViewLogger />
      {children}
    </>
  );
}
