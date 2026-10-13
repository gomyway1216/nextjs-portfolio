import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The site's auth and its save service are stand-ins: nobody is signed in to anything and nothing is fetched.
const site = vi.hoisted(() => ({
  useAuth: vi.fn(),
  service: {
    getGameSave: vi.fn(),
    saveGameSave: vi.fn(),
    getGameSaveAs: vi.fn(),
    saveGameSaveAs: vi.fn(),
    saveGameSaveKeepalive: vi.fn(),
    getGameSaveCredentials: vi.fn(),
    currentGameSaveUid: vi.fn(),
  },
}));
vi.mock('@/providers/AuthProvider', () => ({ useAuth: site.useAuth }));
vi.mock('@/services/gameSaveService', () => site.service);

import { MedalPusherForPlayer } from '@/components/game/MedalPusher/MedalPusherForPlayer';
import { PlayTab } from '@/components/game/MedalPusher/PlayTab';
import { getStrings } from '@/components/game/MedalPusher/i18n';
import { createI18nInstance } from '@/lib/i18n';

const render = (node: React.ReactNode, lang: 'en' | 'ja' = 'en') =>
  renderToStaticMarkup(<I18nextProvider i18n={createI18nInstance(lang)}>{node}</I18nextProvider>);

const SIGN_IN = '/signin?redirect=%2Fgames%2Fmedal-pusher';
const INVITE = /<a[^>]*href="\/signin\?redirect=%2Fgames%2Fmedal-pusher"[^>]*>Sign in to keep it on your account\.<\/a>/;

beforeEach(() => {
  site.useAuth.mockReset();
  for (const stand of Object.values(site.service)) stand.mockReset();
});

describe('the note that says where the machine is kept', () => {
  it('is the device’s, as before, for a cabinet that is told of no player', () => {
    const html = render(<PlayTab />);
    expect(html).toMatch(/<p[^>]*data-saved="true"[^>]*data-testid="pusher-saved"[^>]*data-where="device"[^>]*>This machine is saved on this device\./);
    expect(html).not.toContain('pusher-sign-in');
    expect(html).not.toContain('your account');
  });

  it('invites a guest to sign in, once the site is sure there is nobody', () => {
    const html = render(<PlayTab signInHref={SIGN_IN} />);
    expect(html).toMatch(INVITE);
    expect(html).toContain('data-testid="pusher-sign-in"');
    // Not while the site is still finding out: somebody may be about to turn out to be signed in.
    expect(render(<PlayTab signInHref={SIGN_IN} player={{ uid: null, settled: false, expected: true }} />)).not.toContain('pusher-sign-in');
    expect(render(<PlayTab signInHref={SIGN_IN} player={{ uid: null, settled: false, expected: false }} />)).not.toContain('pusher-sign-in');
  });

  it('does not invite a player who is signed in, and first renders what the server rendered', () => {
    const html = render(<PlayTab signInHref={SIGN_IN} player={{ uid: 'a-made-up-player', settled: true, expected: true }} />);
    expect(html).not.toContain('pusher-sign-in');
    // The keeper has not said anything yet: that comes after mount, and nothing of the account is on the server's page.
    expect(html).toMatch(/data-testid="pusher-saved"[^>]*data-where="device"/);
    expect(site.service.getGameSave).not.toHaveBeenCalled();
    expect(site.service.getGameSaveCredentials).not.toHaveBeenCalled();
  });

  it('invites in Japanese', () => {
    const html = render(<PlayTab signInHref={SIGN_IN} />, 'ja');
    expect(html).toContain('サインインすると、アカウントに預けておけます。');
  });

  it('has words for every place a machine can be kept, in both languages, and none of them the same', () => {
    for (const lang of ['en', 'ja'] as const) {
      const t = getStrings(lang);
      const notes = [t.savedNote, t.unsavedNote, t.accountNote, t.offlineNote, t.unreadableNote, t.checkingNote];
      expect(new Set(notes).size).toBe(notes.length);
      for (const note of [...notes, t.signInInvite, t.resetConfirmAccount]) expect(note.length).toBeGreaterThan(5);
      expect(t.resetConfirmAccount).not.toBe(t.resetConfirm);
    }
    const en = getStrings('en');
    expect(en.accountNote).toContain('saved to your account');
    expect(en.offlineNote).toContain('Could not reach your account');
    expect(en.offlineNote).toContain('kept on this device');
    expect(en.unreadableNote).toContain('left as it is');
    expect(en.resetConfirmAccount).toContain('on your account');
    const ja = getStrings('ja');
    expect(ja.accountNote).toContain('アカウントに預けてあります');
    expect(ja.offlineNote).toContain('この端末に預けてあり');
    expect(ja.resetConfirmAccount).toContain('アカウントのマシン');
  });
});

describe('the page’s game, for whoever is signed in', () => {
  const user = (over: Record<string, unknown> = {}) => ({ uid: 'a-made-up-player', isAnonymous: false, ...over });

  it('shows a visitor the site knows nothing of yet a guest’s machine, with no invitation until the site is sure', () => {
    site.useAuth.mockReturnValue({ currentUser: null, resolving: true, presumedSignedIn: false });
    const html = render(<MedalPusherForPlayer />);
    expect(html).toContain('Medal Pusher');
    expect(html).toMatch(/data-testid="pusher-saved"[^>]*data-where="device"/);
    expect(html).not.toContain('pusher-sign-in');
  });

  it('invites a visitor the site is sure is a guest to sign in and come back to the game', () => {
    site.useAuth.mockReturnValue({ currentUser: null, resolving: false, presumedSignedIn: false });
    expect(render(<MedalPusherForPlayer />)).toMatch(INVITE);
  });

  it('does not invite a player who is signed in, nor one the site expects', () => {
    site.useAuth.mockReturnValue({ currentUser: user(), resolving: false, presumedSignedIn: true });
    expect(render(<MedalPusherForPlayer />)).not.toContain('pusher-sign-in');
    site.useAuth.mockReturnValue({ currentUser: user(), resolving: true, presumedSignedIn: true });
    expect(render(<MedalPusherForPlayer />)).not.toContain('pusher-sign-in');
    site.useAuth.mockReturnValue({ currentUser: null, resolving: true, presumedSignedIn: true });
    expect(render(<MedalPusherForPlayer />)).not.toContain('pusher-sign-in');
  });

  it('takes a visitor Firebase knows only as anonymous for a guest: saves are an account’s', () => {
    site.useAuth.mockReturnValue({ currentUser: user({ isAnonymous: true }), resolving: false, presumedSignedIn: false });
    expect(render(<MedalPusherForPlayer />)).toMatch(INVITE);
  });

  it('asks the account nothing while the page is rendered on the server', () => {
    site.useAuth.mockReturnValue({ currentUser: user(), resolving: false, presumedSignedIn: true });
    render(<MedalPusherForPlayer />);
    for (const stand of Object.values(site.service)) expect(stand).not.toHaveBeenCalled();
  });
});
