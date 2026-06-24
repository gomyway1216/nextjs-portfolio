'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/providers/AuthProvider';
import { useGameToolbar } from '@/contexts/GameToolbarContext';
import type { GameNavEntry } from '@/components/game/constants/gameNav';
import styles from './GlobalToolbar.module.css';
import { cn } from '@/lib/utils/util';
import {
  BookOpenText,
  BriefcaseBusiness,
  ChevronDown,
  ChevronLeft,
  FileText,
  Gamepad2,
  Languages,
  LogIn,
  LogOut,
  Menu,
  NotebookPen,
  Palette,
  Settings,
  Users,
  Wrench,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ThemeToggle';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
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
    prefix: '/projects',
    theme: {
      ...TOOLBAR_THEME_BASE,
      accent: '#0f766e',
      avatarText: '#0f766e',
    },
  },
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
  accent: '#0f766e',
  avatarText: '#0f766e',
};

type PrimaryNavItem = {
  href: string;
  labelKey: string;
  Icon: LucideIcon;
  activePrefixes?: string[];
  adminOnly?: boolean;
};

const PRIMARY_NAV_ITEMS: PrimaryNavItem[] = [
  { href: '/#work', labelKey: 'home.nav.work', Icon: BriefcaseBusiness, activePrefixes: ['/projects'] },
  { href: '/#resume', labelKey: 'home.nav.experience', Icon: FileText },
  { href: '/#community', labelKey: 'home.nav.community', Icon: Users },
  { href: '/blog', labelKey: 'home.nav.writing', Icon: NotebookPen, activePrefixes: ['/blog'] },
  { href: '/#tools', labelKey: 'home.nav.tools', Icon: Wrench, activePrefixes: ['/tools'] },
];

const MORE_NAV_ITEMS: PrimaryNavItem[] = [
  { href: '/games', labelKey: 'home.nav.games', Icon: Gamepad2, activePrefixes: ['/games'] },
  { href: '/study', labelKey: 'home.nav.studyLab', Icon: BookOpenText, activePrefixes: ['/study'] },
  { href: '/hobbies', labelKey: 'home.nav.hobbies', Icon: Palette, activePrefixes: ['/hobbies'], adminOnly: true },
];

type CurrentGameState = {
  pathname: string;
  game: GameNavEntry | null;
};

function getTheme(pathname: string): ThemeConfig {
  for (const { prefix, theme } of THEMES) {
    if (pathname.startsWith(prefix)) return theme;
  }
  return DEFAULT_THEME;
}

function isActivePath(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function isActiveNavItem(pathname: string, item: PrimaryNavItem): boolean {
  return item.activePrefixes?.some((prefix) => isActivePath(pathname, prefix)) ?? false;
}

export function GlobalToolbar() {
  const pathname = usePathname();
  const { t, i18n } = useTranslation();
  const { currentUser, isAdmin, signOut } = useAuth();
  const { content: gameContent } = useGameToolbar();
  const currentLang = i18n.language?.startsWith('ja') ? 'ja' : 'en';
  const nextLang = currentLang === 'en' ? 'ja' : 'en';

  const theme = useMemo(() => getTheme(pathname), [pathname]);
  const isGameSubPage = pathname.startsWith('/games/');
  const hasGameContent = isGameSubPage && gameContent && (gameContent.left || gameContent.center || gameContent.right);
  // Identify the current game so every game page gets a labeled top bar
  // even when the game registers no toolbar content. The catalog is
  // lazy-loaded only on /games/* routes — importing it statically would
  // pull all game metadata into the bundle of every page (this toolbar
  // renders from the root layout).
  const [currentGameState, setCurrentGameState] = useState<CurrentGameState | null>(null);
  useEffect(() => {
    if (!isGameSubPage) return;
    let cancelled = false;
    import('@/components/game/constants/gameNav').then(({ findGameByPath }) => {
      if (!cancelled) {
        setCurrentGameState({
          pathname,
          game: findGameByPath(pathname) ?? null,
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [isGameSubPage, pathname]);

  if (HIDDEN_PATHS.includes(pathname)) return null;
  if (HIDDEN_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return null;

  const toggleLang = () => {
    i18n.changeLanguage(nextLang);
  };

  const accentSoft = `color-mix(in srgb, ${theme.accent} 10%, transparent)`;
  const accentBorder = `color-mix(in srgb, ${theme.accent} 28%, var(--border))`;
  const toolbarBorder = 'color-mix(in srgb, var(--border) 84%, transparent)';
  const toolbarBg = 'color-mix(in srgb, var(--background) 88%, transparent)';
  const displayedGame = isGameSubPage && currentGameState?.pathname === pathname ? currentGameState.game : null;
  const displayedGameTitle = displayedGame
    ? t(`games.${displayedGame.id}.title`, { defaultValue: displayedGame.title })
    : '';
  const brandName = t('home.hero.name');
  const brandRole = t('home.about.role', { defaultValue: t('home.hero.badge') });
  const nextLangLabel = currentLang === 'en' ? '日本語' : 'English';
  const languageSwitchLabel = `${t('home.language.switch')}: ${nextLangLabel}`;
  const hasUserDisplayName = Boolean(currentUser?.displayName);
  const userInitial = (currentUser?.displayName || currentUser?.email || 'U').charAt(0).toUpperCase();
  const userMenuLabel = currentUser?.displayName || currentUser?.email || t('auth.userDefault');
  const primaryNavItems = PRIMARY_NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin);
  const moreNavItems = MORE_NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin);
  const isPrimaryNavActive = primaryNavItems.some((item) => isActiveNavItem(pathname, item));
  const isMoreNavActive = moreNavItems.some((item) => isActiveNavItem(pathname, item));
  const isAnyNavActive = isPrimaryNavActive || isMoreNavActive;

  const renderDropdownNavItem = (item: PrimaryNavItem) => {
    const isActive = isActiveNavItem(pathname, item);
    const Icon = item.Icon;
    return (
      <DropdownMenuItem
        key={item.href}
        asChild
        className="cursor-pointer gap-2"
        style={{
          color: isActive ? theme.accent : undefined,
          backgroundColor: isActive ? accentSoft : undefined,
        }}
      >
        <Link href={item.href}>
          <Icon className="h-4 w-4" />
          {t(item.labelKey)}
        </Link>
      </DropdownMenuItem>
    );
  };

  return (
    <div
      className="sticky top-0 z-50"
      style={{
        backgroundColor: toolbarBg,
        borderBottom: `1px solid ${toolbarBorder}`,
        backdropFilter: 'blur(18px)',
        WebkitBackdropFilter: 'blur(18px)',
      }}
    >
      <div
        className={`${styles.container} mx-auto flex min-h-16 max-w-7xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2 sm:px-6 lg:flex-nowrap lg:py-0`}
      >
        <div className={`${styles.brandSlot} flex min-w-0 flex-1 items-center gap-3`}>
          <Link
            href="/"
            className="group inline-flex min-w-0 shrink-0 items-center gap-2.5 rounded-md transition-colors"
            aria-label={t('home.nav.home')}
          >
            <span
              className="flex h-9 w-9 items-center justify-center rounded-md border text-sm font-bold transition-colors"
              style={{
                borderColor: accentBorder,
                backgroundColor: accentSoft,
                color: theme.accent,
              }}
            >
              Y
            </span>
            <span className="hidden min-w-0 flex-col sm:flex">
              <span className="truncate text-sm font-semibold leading-none text-foreground">{brandName}</span>
              <span className="mt-1 truncate text-[11px] font-medium leading-none text-muted-foreground">
                {brandRole}
              </span>
            </span>
          </Link>
          {isGameSubPage && (
            <Link
              href="/games"
              className="hidden h-9 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-xs font-semibold transition-colors hover:bg-muted sm:inline-flex"
              style={{ borderColor: toolbarBorder, color: theme.accent }}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Games
            </Link>
          )}
          {displayedGame && !gameContent?.left && (
            <span
              className="hidden min-w-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold sm:inline-flex"
              style={{ backgroundColor: accentSoft, color: theme.accent }}
              title={displayedGameTitle}
            >
              <span aria-hidden="true">{displayedGame.thumbnail}</span>
              <span className="truncate">{displayedGameTitle}</span>
            </span>
          )}
          {hasGameContent && gameContent?.left && (
            <div className="flex min-w-0 items-center gap-2 border-l pl-3" style={{ borderColor: toolbarBorder, color: theme.accent }}>
              {gameContent.left}
            </div>
          )}
        </div>

        {!hasGameContent && (
          <nav
            className={`${styles.navSlot} hidden min-w-0 items-center gap-1 lg:flex`}
            aria-label="Primary navigation"
          >
            {primaryNavItems
              .map((item) => {
                const { href, labelKey } = item;
                const isActive = isActiveNavItem(pathname, item);
                return (
                  <Link
                    key={href}
                    href={href}
                    aria-current={isActive ? 'page' : undefined}
                    title={t(labelKey)}
                    className="inline-flex h-9 shrink-0 items-center whitespace-nowrap rounded-md px-2.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    style={{
                      color: isActive ? theme.accent : undefined,
                      backgroundColor: isActive ? accentSoft : undefined,
                    }}
                  >
                    <span>{t(labelKey)}</span>
                  </Link>
                );
              })}
            {moreNavItems.length > 0 && (
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-9 gap-1 rounded-md px-2.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
                    style={{
                      color: isMoreNavActive ? theme.accent : undefined,
                      backgroundColor: isMoreNavActive ? accentSoft : undefined,
                    }}
                  >
                    {t('home.nav.more')}
                    <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  {moreNavItems.map(renderDropdownNavItem)}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </nav>
        )}

        {hasGameContent && gameContent?.center && (
          <div
            className={`${styles.gameCenter} flex w-full items-center gap-2 border-t pt-2 text-sm font-medium md:w-auto md:border-t-0 md:pt-0`}
            style={{ borderColor: toolbarBorder, color: theme.accent }}
          >
            {gameContent.center}
          </div>
        )}

        <div className={`${styles.controlsSlot} ml-auto flex max-w-full shrink-0 items-center justify-end gap-1.5`}>
          {hasGameContent && gameContent?.right}
          {hasGameContent && gameContent?.right && (
            <span className="mx-1 h-5 w-px shrink-0" style={{ backgroundColor: toolbarBorder }} />
          )}
          {!hasGameContent && (
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-9 gap-1.5 rounded-md px-2 text-xs font-semibold text-muted-foreground hover:text-foreground lg:hidden"
                  style={{
                    color: isAnyNavActive ? theme.accent : undefined,
                    backgroundColor: isAnyNavActive ? accentSoft : undefined,
                  }}
                  aria-label={t('home.nav.menu')}
                >
                  <Menu className="h-4 w-4" />
                  <span className="hidden sm:inline">{t('home.nav.menu')}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  {t('home.nav.main')}
                </DropdownMenuLabel>
                {primaryNavItems.map(renderDropdownNavItem)}
                {moreNavItems.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className="text-xs text-muted-foreground">
                      {t('home.nav.more')}
                    </DropdownMenuLabel>
                    {moreNavItems.map(renderDropdownNavItem)}
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <div className="shrink-0">
            <ThemeToggle accent={theme.accent} />
          </div>
          <button
            type="button"
            onClick={toggleLang}
            className="hidden h-9 shrink-0 items-center rounded-md px-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:inline-flex"
            aria-label={languageSwitchLabel}
            title={languageSwitchLabel}
          >
            {nextLangLabel}
          </button>
          <button
            type="button"
            onClick={toggleLang}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:hidden"
            aria-label={languageSwitchLabel}
            title={languageSwitchLabel}
          >
            <Languages className="h-4 w-4" />
          </button>

          {currentUser ? (
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={userMenuLabel}
                  className={cn(
                    'h-9 rounded-full text-xs font-semibold text-muted-foreground hover:text-foreground',
                    hasUserDisplayName
                      ? 'w-9 gap-0 px-0 md:w-auto md:gap-2 md:pl-1.5 md:pr-2'
                      : 'w-9 gap-0 px-0',
                  )}
                >
                  <div
                    className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold"
                    style={{ backgroundColor: accentSoft, color: theme.avatarText }}
                  >
                    {userInitial}
                  </div>
                  {hasUserDisplayName && (
                    <span className="hidden max-w-28 truncate md:inline">{currentUser.displayName}</span>
                  )}
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
                className="h-9 gap-1.5 rounded-md px-2.5 text-xs font-semibold"
                style={{ color: theme.accent }}
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
