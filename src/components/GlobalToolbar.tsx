'use client';

import { useMemo } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/providers/AuthProvider';
import { useGameToolbar } from '@/contexts/GameToolbarContext';
import {
  BookOpenText,
  Gamepad2,
  Home,
  LogIn,
  LogOut,
  NotebookPen,
  Palette,
  Settings,
  Wrench,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ThemeToggle';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// Exact-match paths that hide the GlobalToolbar.
const HIDDEN_PATHS = ['/', '/signin'];

// Path prefixes that hide the GlobalToolbar — useful for sections that
// render their own chrome (e.g. /admin has its own sidebar with a built-in
// "← meetyudai.com" link, so a second top toolbar is redundant + visually
// collides with the fixed sidebar).
const HIDDEN_PREFIXES = ['/admin'];

interface ThemeConfig {
  bg: string;
  border: string;
  accent: string;
  avatarBg: string;
  avatarText: string;
}

const TOOLBAR_THEME_BASE: Pick<ThemeConfig, 'bg' | 'border' | 'avatarBg'> = {
  bg: 'color-mix(in srgb, var(--background) 88%, var(--muted) 12%)',
  border: 'color-mix(in srgb, var(--border) 76%, var(--background) 24%)',
  avatarBg: 'color-mix(in srgb, var(--muted) 72%, var(--background) 28%)',
};

const THEMES: { prefix: string; theme: ThemeConfig }[] = [
  {
    prefix: '/tools/score-tracker',
    theme: {
      ...TOOLBAR_THEME_BASE,
      accent: '#0ea5e9',
      avatarText: '#0ea5e9',
    },
  },
  {
    prefix: '/tools/kuizu',
    theme: {
      ...TOOLBAR_THEME_BASE,
      accent: '#f97316',
      avatarText: '#f97316',
    },
  },
  {
    prefix: '/tools/settli',
    theme: {
      ...TOOLBAR_THEME_BASE,
      accent: '#6366f1',
      avatarText: '#6366f1',
    },
  },
  {
    prefix: '/games',
    theme: {
      ...TOOLBAR_THEME_BASE,
      accent: '#0ea5e9',
      avatarText: '#0ea5e9',
    },
  },
  {
    prefix: '/study',
    theme: {
      ...TOOLBAR_THEME_BASE,
      accent: '#7c3aed',
      avatarText: '#7c3aed',
    },
  },
  {
    prefix: '/hobbies',
    theme: {
      ...TOOLBAR_THEME_BASE,
      accent: '#a855f7',
      avatarText: '#a855f7',
    },
  },
  {
    prefix: '/tools/kaimono',
    theme: {
      ...TOOLBAR_THEME_BASE,
      accent: '#10b981',
      avatarText: '#10b981',
    },
  },
  {
    prefix: '/tools',
    theme: {
      ...TOOLBAR_THEME_BASE,
      accent: '#2563eb',
      avatarText: '#2563eb',
    },
  },
  {
    prefix: '/blog',
    theme: {
      ...TOOLBAR_THEME_BASE,
      accent: '#22c55e',
      avatarText: '#16a34a',
    },
  },
];

const DEFAULT_THEME: ThemeConfig = {
  ...TOOLBAR_THEME_BASE,
  accent: 'var(--foreground)',
  avatarText: 'var(--foreground)',
};

const PRIMARY_NAV_ITEMS = [
  { href: '/#tools', prefix: '/tools', labelKey: 'home.nav.tools', Icon: Wrench },
  { href: '/games', prefix: '/games', labelKey: 'home.nav.games', Icon: Gamepad2 },
  { href: '/study', prefix: '/study', labelKey: 'home.nav.study', Icon: BookOpenText },
  { href: '/blog', prefix: '/blog', labelKey: 'home.nav.blog', Icon: NotebookPen },
  { href: '/hobbies', prefix: '/hobbies', labelKey: 'home.nav.hobbies', Icon: Palette },
];

function getTheme(pathname: string): ThemeConfig {
  for (const { prefix, theme } of THEMES) {
    if (pathname.startsWith(prefix)) return theme;
  }
  return DEFAULT_THEME;
}

function isActivePath(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function GlobalToolbar() {
  const pathname = usePathname();
  const { t, i18n } = useTranslation();
  const { currentUser, isAdmin, signOut } = useAuth();
  const { content: gameContent } = useGameToolbar();
  const currentLang = i18n.language?.startsWith('ja') ? 'ja' : 'en';

  const theme = useMemo(() => getTheme(pathname), [pathname]);
  const isGameSubPage = pathname.startsWith('/games/');
  const hasGameContent = isGameSubPage && gameContent && (gameContent.left || gameContent.center || gameContent.right);

  if (HIDDEN_PATHS.includes(pathname)) return null;
  if (HIDDEN_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return null;

  const toggleLang = () => {
    i18n.changeLanguage(currentLang === 'en' ? 'ja' : 'en');
  };

  const setLanguage = (lang: 'en' | 'ja') => {
    if (lang !== currentLang) i18n.changeLanguage(lang);
  };

  return (
    <div
      className="sticky top-0 z-50"
      style={{ backgroundColor: theme.bg, borderBottom: `1px solid ${theme.border}` }}
    >
      <div
        className={`mx-auto max-w-6xl items-center gap-2 px-2 sm:gap-4 sm:px-4 ${
          hasGameContent ? 'flex justify-between' : 'flex justify-between md:grid'
        }`}
        style={
          hasGameContent
            ? { minHeight: '3.25rem', flexWrap: 'wrap', rowGap: '0.5rem' }
            : { minHeight: '3.25rem', gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)' }
        }
      >
        {/* Left: Home / Back / Game left */}
        <div
          className={`flex items-center gap-3 min-w-0 ${hasGameContent ? 'flex-1' : 'shrink-0 md:flex-1'}`}
          style={!hasGameContent ? { gridColumn: 1 } : undefined}
        >
          <Link
            href="/"
            className="flex items-center gap-1.5 text-sm font-semibold transition-colors shrink-0"
            style={{ color: theme.accent }}
          >
            <Home className="h-4 w-4" />
            <span className="hidden sm:inline">meetyudai.com</span>
          </Link>
          {isGameSubPage && (
            <>
              <span style={{ color: theme.border }} className="shrink-0">|</span>
              <Link
                href="/games"
                className="text-xs transition-colors shrink-0"
                style={{ color: `color-mix(in srgb, ${theme.accent} 60%, transparent)` }}
              >
                ← Games
              </Link>
            </>
          )}
          {hasGameContent && gameContent?.left && (
            <>
              <span style={{ color: theme.border }} className="shrink-0">|</span>
              <div className="flex items-center gap-2 min-w-0" style={{ color: theme.accent }}>
                {gameContent.left}
              </div>
            </>
          )}
        </div>

        {!hasGameContent && (
          <nav
            className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto rounded-md border px-1.5 py-1 md:flex-none md:overflow-visible"
            style={{ borderColor: theme.border, backgroundColor: theme.avatarBg, gridColumn: 2 }}
            aria-label="Primary navigation"
          >
            {PRIMARY_NAV_ITEMS.map(({ href, prefix, labelKey, Icon }) => {
              const isActive = isActivePath(pathname, prefix);
              return (
                <Link
                  key={href}
                  href={href}
                  className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-xs font-semibold transition-colors"
                  style={{
                    color: isActive ? 'var(--background)' : theme.accent,
                    backgroundColor: isActive ? theme.accent : 'transparent',
                  }}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {t(labelKey)}
                </Link>
              );
            })}
          </nav>
        )}

        {/* Center: Game stats / center content */}
        {hasGameContent && gameContent?.center && (
          <div className="flex items-center gap-2 shrink-0" style={{ color: theme.accent }}>
            {gameContent.center}
          </div>
        )}

        {/* Right: Game right + Lang + Auth */}
        <div
          className={`flex max-w-full items-center gap-2 min-w-0 justify-end ${hasGameContent ? 'flex-wrap' : 'flex-nowrap'}`}
          style={!hasGameContent ? { gridColumn: 3 } : undefined}
        >
          {hasGameContent && gameContent?.right}
          {hasGameContent && gameContent?.right && <span style={{ color: theme.border }}>|</span>}
          <div className={hasGameContent ? 'shrink-0' : 'hidden shrink-0 sm:block'}>
            <ThemeToggle accent={theme.accent} />
          </div>
          {/* Language toggle */}
          <div
            className="hidden h-8 shrink-0 items-center rounded-full border p-0.5 sm:inline-flex"
            role="group"
            aria-label={t('home.language.switch')}
            title={t('home.language.switch')}
            style={{ backgroundColor: theme.avatarBg, borderColor: theme.border }}
          >
            {(['ja', 'en'] as const).map((lang) => {
              const isActive = currentLang === lang;
              return (
                <button
                  key={lang}
                  type="button"
                  onClick={() => setLanguage(lang)}
                  aria-pressed={isActive}
                  className="h-7 rounded-full px-2 text-xs font-semibold transition-colors"
                  style={{
                    backgroundColor: isActive ? theme.accent : 'transparent',
                    color: isActive ? 'var(--background)' : theme.accent,
                  }}
                >
                  {lang.toUpperCase()}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={toggleLang}
            className="h-8 shrink-0 rounded-full px-2.5 text-xs font-semibold transition-colors sm:hidden"
            aria-label={t('home.language.switch')}
            title={t('home.language.switch')}
            style={{ backgroundColor: theme.avatarBg, color: theme.accent }}
          >
            {currentLang === 'en' ? 'JA' : 'EN'}
          </button>

          {/* Auth */}
          {currentUser ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" style={{ borderRadius: '9999px' }}>
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium"
                    style={{ backgroundColor: theme.avatarBg, color: theme.avatarText }}
                  >
                    {(currentUser.displayName || currentUser.email || 'U').charAt(0).toUpperCase()}
                  </div>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <div className="px-2 py-1.5">
                  <p className="text-sm font-medium truncate">{currentUser.displayName || t('auth.userDefault')}</p>
                  <p className="text-xs text-muted-foreground truncate">{currentUser.email}</p>
                </div>
                <DropdownMenuSeparator />
                {isAdmin && (
                  <DropdownMenuItem asChild>
                    <Link href="/admin" className="cursor-pointer">
                      <Settings className="h-4 w-4 mr-2" />
                      {t('auth.admin')}
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => signOut()} className="cursor-pointer text-destructive focus:text-destructive">
                  <LogOut className="h-4 w-4 mr-2" />
                  {t('auth.logout')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Link href={`/signin?redirect=${encodeURIComponent(pathname)}`}>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs gap-1"
                style={{ borderRadius: '9999px', color: theme.accent }}
              >
                <LogIn className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{t('auth.login')}</span>
              </Button>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
