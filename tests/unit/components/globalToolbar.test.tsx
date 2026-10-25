import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { GlobalToolbar } from '@/components/GlobalToolbar';

const route = vi.hoisted(() => ({ pathname: '/games/starcat-caravan' }));
vi.mock('next/navigation', () => ({ usePathname: () => route.pathname }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({
  t: (key: string) => key,
  i18n: { language: 'en', changeLanguage: vi.fn() },
}) }));
vi.mock('@/providers/AuthProvider', () => ({ useAuth: () => ({ currentUser: null, isAdmin: false, signOut: vi.fn(), presumedSignedIn: false }) }));
vi.mock('@/components/ThemeToggle', () => ({ ThemeToggle: () => <button>Theme</button> }));

describe('mobile Starcat site chrome', () => {
  it('marks only the game itself for responsive immersive mode and retains its desktop navigation', () => {
    route.pathname='/games/starcat-caravan';
    const html=renderToStaticMarkup(<GlobalToolbar/>);
    expect(html).toContain('data-mobile-immersive="true"');
    expect(html).toContain('href="/games"');
    expect(html).toContain('href="/"');
  });
  it.each(['/games/starcat-caravan/guide','/games/starcat-caravan-old','/games','/games/shogi','/blog'])('keeps the normal toolbar on %s', pathname => {
    route.pathname=pathname;
    const html=renderToStaticMarkup(<GlobalToolbar/>);
    expect(html).not.toContain('data-mobile-immersive');
    expect(html).toContain('home.hero.name');
  });
});
