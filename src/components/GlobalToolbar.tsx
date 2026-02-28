'use client';

import { useMemo } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/providers/AuthProvider';
import { useGameToolbar } from '@/contexts/GameToolbarContext';
import { Home, LogIn, LogOut, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const HIDDEN_PATHS = ['/', '/signin'];

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
      bg: 'rgba(99,102,241,0.06)',
      border: 'rgba(99,102,241,0.2)',
      accent: '#6366f1',
      avatarBg: 'rgba(99,102,241,0.12)',
      avatarText: '#6366f1',
    },
  },
  {
    prefix: '/games',
    theme: {
      bg: 'rgba(0,0,0,0.85)',
      border: 'rgba(14,165,233,0.3)',
      accent: '#0ea5e9',
      avatarBg: 'rgba(14,165,233,0.15)',
      avatarText: '#0ea5e9',
    },
  },
  {
    prefix: '/study',
    theme: {
      bg: 'rgba(124,58,237,0.06)',
      border: 'rgba(124,58,237,0.2)',
      accent: '#7c3aed',
      avatarBg: 'rgba(124,58,237,0.12)',
      avatarText: '#7c3aed',
    },
  },
  {
    prefix: '/hobbies',
    theme: {
      bg: 'rgba(168,85,247,0.06)',
      border: 'rgba(168,85,247,0.2)',
      accent: '#a855f7',
      avatarBg: 'rgba(168,85,247,0.12)',
      avatarText: '#a855f7',
    },
  },
  {
    prefix: '/admin',
    theme: {
      bg: 'rgba(168,85,247,0.06)',
      border: 'rgba(168,85,247,0.2)',
      accent: '#a855f7',
      avatarBg: 'rgba(168,85,247,0.12)',
      avatarText: '#a855f7',
    },
  },
  {
    prefix: '/blog',
    theme: {
      bg: 'rgba(34,197,94,0.06)',
      border: 'rgba(34,197,94,0.2)',
      accent: '#22c55e',
      avatarBg: 'rgba(34,197,94,0.12)',
      avatarText: '#16a34a',
    },
  },
];

const DEFAULT_THEME: ThemeConfig = {
  bg: 'transparent',
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
  const { i18n } = useTranslation();
  const { currentUser, isAdmin, signOut } = useAuth();
  const { content: gameContent } = useGameToolbar();
  const currentLang = i18n.language?.startsWith('ja') ? 'ja' : 'en';

  const theme = useMemo(() => getTheme(pathname), [pathname]);
  const isGameSubPage = pathname.startsWith('/games/');
  const hasGameContent = isGameSubPage && gameContent && (gameContent.left || gameContent.center || gameContent.right);

  if (HIDDEN_PATHS.includes(pathname)) return null;

  const toggleLang = () => {
    i18n.changeLanguage(currentLang === 'en' ? 'ja' : 'en');
  };

  return (
    <div
      className="sticky top-0 z-50 backdrop-blur-sm"
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
                  <p className="text-sm font-medium truncate">{currentUser.displayName || 'ユーザー'}</p>
                  <p className="text-xs text-muted-foreground truncate">{currentUser.email}</p>
                </div>
                <DropdownMenuSeparator />
                {isAdmin && (
                  <DropdownMenuItem asChild>
                    <Link href="/admin" className="cursor-pointer">
                      <Settings className="h-4 w-4 mr-2" />
                      管理画面
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => signOut()} className="cursor-pointer text-destructive focus:text-destructive">
                  <LogOut className="h-4 w-4 mr-2" />
                  ログアウト
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
                <span className="hidden sm:inline">ログイン</span>
              </Button>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
