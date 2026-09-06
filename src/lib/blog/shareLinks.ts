// Share-intent URLs for a post. Plain links, no third-party scripts: the
// networks' intent endpoints accept the target URL/title as query params.
export type ShareNetwork = 'x' | 'linkedin' | 'hatena';

export interface ShareTarget {
  network: ShareNetwork;
  label: string;
  href: string;
}

export function buildShareTargets(url: string, title: string): ShareTarget[] {
  const encodedUrl = encodeURIComponent(url);
  const encodedTitle = encodeURIComponent(title);
  return [
    {
      network: 'x',
      label: 'X',
      href: `https://x.com/intent/post?text=${encodedTitle}&url=${encodedUrl}`,
    },
    {
      network: 'linkedin',
      label: 'LinkedIn',
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
    },
    // Hatena Bookmark is where Japanese engineering posts get discovered;
    // the "panel" endpoint opens the add-bookmark form for the URL.
    {
      network: 'hatena',
      label: 'Hatena',
      href: `https://b.hatena.ne.jp/entry/panel/?url=${encodedUrl}&btitle=${encodedTitle}`,
    },
  ];
}
