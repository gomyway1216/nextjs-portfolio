// Primary site sections, in the order they are offered as "where to go
// next" links (site footer, 404). Labels are i18n keys under home.nav.*.
export const SITE_SECTION_LINKS = [
  { href: '/blog', labelKey: 'home.nav.blog' },
  { href: '/projects', labelKey: 'home.nav.work' },
  { href: '/tools', labelKey: 'home.nav.tools' },
  { href: '/games', labelKey: 'home.nav.games' },
  { href: '/study', labelKey: 'home.nav.study' },
  { href: '/growth', labelKey: 'home.nav.growth' },
] as const;

export const RSS_PATH = '/rss.xml';
