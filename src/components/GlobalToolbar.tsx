'use client';

import { useMemo } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/providers/AuthProvider';
import { useGameToolbar } from '@/contexts/GameToolbarContext';
import { Home, LogIn, LogOut, Settings } from 'lucide-react';
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

const THEMES: { prefix: string; theme: ThemeConfig }[] = [
  {
    prefix: '/tools/settli',
    theme: {
      bg: 'color-mix(in srgb, var(--background) 92%, #6366f1 8%)',
      border: 'color-mix(in srgb, var(--border) 70%, #6366f1 30%)',
      accent: '#6366f1',
      avatarBg: 'color-mix(in srgb, var(--background) 82%, #6366f1 18%)',
      avatarText: '#6366f1',
    },
  },
  {
    prefix: '/games',
    theme: {
      bg: 'color-mix(in srgb, var(--background) 88%, #0ea5e9 12%)',
      border: 'color-mix(in srgb, var(--border) 65%, #0ea5e9 35%)',
      accent: '#0ea5e9',
      avatarBg: 'color-mix(in srgb, var(--background) 80%, #0ea5e9 20%)',
      avatarText: '#0ea5e9',
    },
  },
  {
    prefix: '/study',
    theme: {
      bg: 'color-mix(in srgb, var(--background) 92%, #7c3aed 8%)',
      border: 'color-mix(in srgb, var(--border) 70%, #7c3aed 30%)',
      accent: '#7c3aed',
      avatarBg: 'color-mix(in srgb, var(--background) 82%, #7c3aed 18%)',
      avatarText: '#7c3aed',
    },
  },
  {
    prefix: '/hobbies',
    theme: {
      bg: 'color-mix(in srgb, var(--background) 92%, #a855f7 8%)',
      border: 'color-mix(in srgb, var(--border) 70%, #a855f7 30%)',
      accent: '#a855f7',
      avatarBg: 'color-mix(in srgb, var(--background) 82%, #a855f7 18%)',
      avatarText: '#a855f7',
    },
  },
  {
    prefix: '/admin',
    theme: {
      bg: 'color-mix(in srgb, var(--background) 92%, #a855f7 8%)',
      border: 'color-mix(in srgb, var(--border) 70%, #a855f7 30%)',
      accent: '#a855f7',
      avatarBg: 'color-mix(in srgb, var(--background) 82%, #a855f7 18%)',
      avatarText: '#a855f7',
    },
  },
  {
    prefix: '/tools/kaimono',
    theme: {
      bg: 'color-mix(in srgb, var(--background) 92%, #10b981 8%)',
      border: 'color-mix(in srgb, var(--border) 70%, #10b981 30%)',
      accent: '#10b981',
      avatarBg: 'color-mix(in srgb, var(--background) 82%, #10b981 18%)',
      avatarText: '#10b981',
    },
  },
  {
    prefix: '/blog',
    theme: {
      bg: 'color-mix(in srgb, var(--background) 92%, #22c55e 8%)',
      border: 'color-mix(in srgb, var(--border) 70%, #22c55e 30%)',
      accent: '#22c55e',
      avatarBg: 'color-mix(in srgb, var(--background) 82%, #22c55e 18%)',
      avatarText: '#16a34a',
    },
  },
];

const DEFAULT_THEME: ThemeConfig = {
  // `transparent` made the toolbar fully see-through on unthemed routes
  // (e.g. /tools/kuizu, /voice-tasks); combined with the (now removed)
  // backdrop-blur class, content scrolling underneath was blurred and
  // hard to read. Match the page bg so the bar is opaque without being
  // visually heavy.
  bg: 'var(--background)',
  border: 'var(--border)',
  accent: 'var(--foreground)',
  avatarBg: 'var(--muted)',
  avatarText: 'var(--foreground)',
};

function getTheme(pathname: string): ThemeConfig {
  for (const { prefix, theme } of THEMES) {
    if (pathname.startsWith(prefix)) return theme;
  }
  return DEFAULT_THEME;
}

export function GlobalToolbar() {
  const pathname = usePathname();
  const { t, i18n } = useTranslation();
  const { currentUser, isAdmin, signOut } = useAuth();
  const { content: gameContent } = useGameToolbar();
  const currentLang = i18n.language?.startsWith('ja') ? 'ja' : 'en';

  const theme = useMemo(
    () => (pathname === '/games' ? DEFAULT_THEME : getTheme(pathname)),
    [pathname],
  );
  const isGameSubPage = pathname.startsWith('/games/');
  const hasGameContent = isGameSubPage && gameContent && (gameContent.left || gameContent.center || gameContent.right);

  if (HIDDEN_PATHS.includes(pathname)) return null;
  if (HIDDEN_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return null;

  const toggleLang = () => {
    i18n.changeLanguage(currentLang === 'en' ? 'ja' : 'en');
  };

  return (
    <div
      className="sticky top-0 z-50"
      style={{ backgroundColor: theme.bg, borderBottom: `1px solid ${theme.border}` }}
    >
      <div className="container mx-auto px-4 flex items-center justify-between max-w-4xl gap-4 flex-wrap" style={{ minHeight: '3rem' }}>
        {/* Left: Home / Back / Game left */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-sm font-medium transition-colors shrink-0"
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
                style={{ color: `${theme.accent}99` }}
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

        {/* Center: Game stats / center content */}
        {hasGameContent && gameContent?.center && (
          <div className="flex items-center gap-2 shrink-0" style={{ color: theme.accent }}>
            {gameContent.center}
          </div>
        )}

        {/* Right: Game right + Lang + Auth */}
        <div className="flex items-center gap-2 shrink-0">
          {hasGameContent && gameContent?.right}
          {hasGameContent && gameContent?.right && <span style={{ color: theme.border }}>|</span>}
          <ThemeToggle accent={theme.accent} />
          {/* Language toggle */}
          <button
            onClick={toggleLang}
            className="text-xs font-medium px-2.5 py-1 rounded-full transition-colors"
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
