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
FileText,
Gamepad2,
House,
LineChart,
NotebookPen,
Palette,
Shield,
UserRound,
Wrench,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Tooltip } from 'react-tooltip';

// Section IDs the home-page nav scroll-spies on, in document order.
// The first one whose top crosses into the viewport's top band gets
// the `active` class.
const SECTION_IDS = ['home', 'impact', 'resume', 'tools', 'study', 'games', 'blog', 'about'] as const;

const Header = () => {
  const [click, setClick] = useState<boolean>(false);
  const [showDropdown, setShowDropdown] = useState<boolean>(false);
  const handleClick = () => setClick(!click);
  const _toggleDropdown = () => setShowDropdown(!showDropdown);
  const router = useRouter();
  const { currentUser, signOut } = useAuth();
  const { t, i18n } = useTranslation();
  const activeSection = useActiveSection(SECTION_IDS);

  const handleSignOut = () => {
    signOut();
  };

  const language = i18n.language === 'ja' ? 'ja' : 'en';

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
            <li className={activeSection === 'home' ? 'active' : ''}>
              <Link
                className="nav-link "
                href="/#home"
                data-tooltip-id="left-menu-tooltip"
                data-tooltip-content={t('home.nav.home')}
                onClick={handleClick}
              >
                <House size={20} />
              </Link>
            </li>
            <li className={activeSection === 'impact' ? 'active' : ''}>
              <Link
                className="nav-link"
                href="/#impact"
                data-tooltip-id="left-menu-tooltip"
                data-tooltip-content={t('home.nav.impact')}
                onClick={handleClick}
              >
                <LineChart size={20} />
              </Link>
            </li>
            <li className={activeSection === 'resume' ? 'active' : ''}>
              <Link
                className="nav-link"
                href="/#resume"
                data-tooltip-id="left-menu-tooltip"
                data-tooltip-content={t('home.nav.resume')}
                onClick={handleClick}
              >
                <FileText size={20} />
              </Link>
            </li>
            <li className={activeSection === 'tools' ? 'active' : ''}>
              <Link
                className="nav-link"
                href="/#tools"
                data-tooltip-id="left-menu-tooltip"
                data-tooltip-content={t('home.nav.tools')}
                onClick={handleClick}
              >
                <Wrench size={20} />
              </Link>
            </li>
            <li className={activeSection === 'study' ? 'active' : ''}>
              <Link
                className="nav-link"
                href="/#study"
                data-tooltip-id="left-menu-tooltip"
                data-tooltip-content={t('home.nav.study')}
                onClick={handleClick}
              >
                <BookOpenText size={20} />
              </Link>
            </li>
            <li className={activeSection === 'games' ? 'active' : ''}>
              <Link
                className="nav-link"
                href="/#games"
                data-tooltip-id="left-menu-tooltip"
                data-tooltip-content={t('home.nav.games')}
                onClick={handleClick}
              >
                <Gamepad2 size={20} />
              </Link>
            </li>
            <li className={activeSection === 'blog' ? 'active' : ''}>
              <Link
                className="nav-link"
                href="/#blog"
                data-tooltip-id="left-menu-tooltip"
                data-tooltip-content={t('home.nav.blog')}
                onClick={handleClick}
              >
                <NotebookPen size={20} />
              </Link>
            </li>
            <li className={activeSection === 'about' ? 'active' : ''}>
              <Link
                className="nav-link"
                href="/#about"
                data-tooltip-id="left-menu-tooltip"
                data-tooltip-content={t('home.nav.about')}
                onClick={handleClick}
              >
                <UserRound size={20} />
              </Link>
            </li>
            <li>
              <Link
                className="nav-link"
                href="/hobbies"
                data-tooltip-id="left-menu-tooltip"
                data-tooltip-content={t('home.nav.hobbies')}
                onClick={handleClick}
              >
                <Palette size={20} />
              </Link>
            </li>
            {currentUser && (
              <li>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <a
                      className="nav-link"
                      data-tooltip-id="left-menu-tooltip"
                      data-tooltip-content={t('home.nav.admin')}
                    >
                      <Shield size={20} />
                    </a>
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
