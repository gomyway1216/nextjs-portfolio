'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/providers/AuthProvider';
import { Home, LogIn, LogOut, User, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const HIDDEN_PATHS = ['/', '/signin'];

export function GlobalToolbar() {
  const pathname = usePathname();
  const { i18n } = useTranslation();
  const { currentUser, isAdmin, signOut } = useAuth();
  const currentLang = i18n.language?.startsWith('ja') ? 'ja' : 'en';

  if (HIDDEN_PATHS.includes(pathname)) return null;

  const toggleLang = () => {
    i18n.changeLanguage(currentLang === 'en' ? 'ja' : 'en');
  };

  return (
    <div className="sticky top-0 z-50 bg-background/80 backdrop-blur-sm border-b">
      <div className="container mx-auto px-4 h-12 flex items-center justify-between max-w-4xl">
        {/* Left: Home */}
        <Link href="/" className="flex items-center gap-1.5 text-sm font-medium hover:text-primary transition-colors">
          <Home className="h-4 w-4" />
          <span className="hidden sm:inline">meetyudai.com</span>
        </Link>

        {/* Right: Lang + Auth */}
        <div className="flex items-center gap-2">
          {/* Language toggle */}
          <button
            onClick={toggleLang}
            className="text-xs font-medium px-2 py-1 rounded-full bg-muted hover:bg-muted/80 transition-colors"
          >
            {currentLang === 'en' ? 'JA' : 'EN'}
          </button>

          {/* Auth */}
          {currentUser ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" style={{ borderRadius: '9999px' }}>
                  <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-medium">
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
              <Button variant="ghost" size="sm" className="h-8 text-xs gap-1" style={{ borderRadius: '9999px' }}>
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
