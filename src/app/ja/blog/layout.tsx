import SiteFooter from '@/components/common/SiteFooter';

// Language-pinned article routes get the same footer as the default blog
// tree, so a /ja reader can continue into the rest of the site.
export default function JaBlogLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <SiteFooter />
    </>
  );
}
