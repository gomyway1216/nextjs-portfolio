'use client';
import { ThemeToggle } from '@/components/ThemeToggle';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useActiveSection } from '@/hooks/useActiveSection';
import { useAuth } from '@/providers/AuthProvider';
import {
  BookOpenText,
  BriefcaseBusiness,
  FolderKanban,
  Gamepad2,
  House,
  LineChart,
  Newspaper,
  NotebookPen,
  Shield,
  UserRound,
  Users,
  Wrench,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Tooltip } from 'react-tooltip';

const isBlogPath = (path: string | null | undefined): boolean =>
  path === '/blog' || !!path?.startsWith('/blog/');

const SIDEBAR_NAV_ITEMS = [
  { kind: 'section', id: 'home', href: '/#home', labelKey: 'home.nav.home', Icon: House },
  {
    kind: 'section',
    id: 'impact',
    href: '/#impact',
    labelKey: 'home.nav.impact',
    Icon: LineChart,
  },
  {
    kind: 'section',
    id: 'resume',
    href: '/#resume',
    labelKey: 'home.nav.resume',
    Icon: BriefcaseBusiness,
  },
  {
    kind: 'section',
    id: 'writing',
    href: '/#writing',
    labelKey: 'home.nav.writing',
    Icon: Newspaper,
  },
  { kind: 'section', id: 'tools', href: '/tools', labelKey: 'home.nav.tools', Icon: Wrench },
  { kind: 'section', id: 'work', href: '/#work', labelKey: 'home.nav.work', Icon: FolderKanban },
  {
    kind: 'section',
    id: 'community',
    href: '/#community',
    labelKey: 'home.nav.community',
    Icon: Users,
  },
  {
    kind: 'route',
    id: 'blog',
    href: '/blog',
    labelKey: 'home.nav.blog',
    Icon: NotebookPen,
    isActive: isBlogPath,
  },
  { kind: 'section', id: 'study', href: '/#study', labelKey: 'home.nav.study', Icon: BookOpenText },
  { kind: 'section', id: 'games', href: '/#games', labelKey: 'home.nav.games', Icon: Gamepad2 },
  { kind: 'section', id: 'about', href: '/#about', labelKey: 'home.nav.about', Icon: UserRound },
] as const;

// Section IDs the home-page nav scroll-spies on, in the same order the
// sidebar renders those section links.
const SECTION_IDS_WITH_WRITING = SIDEBAR_NAV_ITEMS.flatMap((item) =>
  item.kind === 'section' ? [item.id] : [],
);
const SECTION_IDS_WITHOUT_WRITING = SECTION_IDS_WITH_WRITING.filter((id) => id !== 'writing');

interface HeaderProps {
  showWriting?: boolean;
}

const Header = ({ showWriting = false }: HeaderProps) => {
  const [click, setClick] = useState<boolean>(false);
  const handleClick = () => setClick(!click);
  const router = useRouter();
  const pathname = usePathname();
  const { currentUser, signOut } = useAuth();
  const { t, i18n } = useTranslation();
  const sectionIds = showWriting ? SECTION_IDS_WITH_WRITING : SECTION_IDS_WITHOUT_WRITING;
  const activeSection = useActiveSection(sectionIds);

  const handleSignOut = () => {
    signOut();
  };

  const language = i18n.language?.startsWith('ja') ? 'ja' : 'en';

  const setLanguage = (lang: 'en' | 'ja') => {
    i18n.changeLanguage(lang);
  };

  return (
    <>
      {/* Header */}
      <div className="mob-header">
        <div className="mob-theme-toggle">
          <ThemeToggle />
        </div>
        <button
          className="toggler-menu"
          onClick={handleClick}
          aria-label={click ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={click}
        >
          <div className={click ? 'active' : ''}>
            <span></span>
            <span></span>
            <span></span>
          </div>
        </button>
      </div>
      {/* End Header */}

      {/* nav bar */}
      <header className={click ? 'header-left menu-open' : 'header-left '}>
        <div className="scroll-bar">
          <div className="hl-top">
            <div className="hl-logo">
              <Link
                href="/"
                aria-label={t('home.nav.home')}
                data-tooltip-id="left-menu-tooltip"
                data-tooltip-content={t('home.nav.home')}
              >
                Y
              </Link>
              <div className="hl-lang-toggle" aria-label={t('home.language.switch')}>
                <button
                  type="button"
                  className={language === 'en' ? 'active' : ''}
                  onClick={() => setLanguage('en')}
                >
                  EN
                </button>
                <button
                  type="button"
                  className={language === 'ja' ? 'active' : ''}
                  onClick={() => setLanguage('ja')}
                >
                  JA
                </button>
              </div>
              <div className="hl-theme-toggle">
                <ThemeToggle />
              </div>
            </div>
          </div>
          {/* End htl-top */}

          <ul className="nav nav-menu">
            {SIDEBAR_NAV_ITEMS.map((item) => {
              if (item.id === 'writing' && !showWriting) return null;

              const label = t(item.labelKey);
              const Icon = item.Icon;
              const isActive =
                item.kind === 'section' ? activeSection === item.id : item.isActive(pathname);

              return (
                <li key={item.id} className={isActive ? 'active' : ''}>
                  <Link
                    className="nav-link"
                    href={item.href}
                    aria-label={label}
                    aria-current={
                      isActive ? (item.kind === 'section' ? 'location' : 'page') : undefined
                    }
                    data-tooltip-id="left-menu-tooltip"
                    data-tooltip-content={label}
                    onClick={handleClick}
                  >
                    <Icon size={20} />
                  </Link>
                </li>
              );
            })}
            {currentUser && (
              <li>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="nav-link"
                      aria-label={t('home.nav.admin')}
                      style={{ border: 0, background: 'transparent', cursor: 'pointer', font: 'inherit' }}
                      data-tooltip-id="left-menu-tooltip"
                      data-tooltip-content={t('home.nav.admin')}
                    >
                      <Shield size={20} />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => router.push('/admin')}>
                      Admin Page
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleSignOut}>
                      Log out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            )}
          </ul>
          <Tooltip id="left-menu-tooltip" place="right" variant="dark" />
        </div>
      </header>
      {/* End Header */}
    </>
  );
};

export default Header;
