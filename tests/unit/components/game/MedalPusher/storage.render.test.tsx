import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PlayTab, RESET_WINDOW, confirmsReset } from '@/components/game/MedalPusher/PlayTab';
import { getStrings } from '@/components/game/MedalPusher/i18n';
import { JACKPOT_START } from '@/components/game/MedalPusher/lottery';
import { START_CREDITS, createSession, insert } from '@/components/game/MedalPusher/session';
import { STORAGE_KEY, serialize } from '@/components/game/MedalPusher/storage';
import { createI18nInstance } from '@/lib/i18n';

const render = (node: React.ReactNode, lang: 'en' | 'ja' = 'en') =>
  renderToStaticMarkup(<I18nextProvider i18n={createI18nInstance(lang)}>{node}</I18nextProvider>);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the second press of Reset', () => {
  const first = 1_700_000_000_000;
  const window = RESET_WINDOW * 1000;

  it('counts from the moment of the first press until the window closes, and not at the instant it closes', () => {
    expect(confirmsReset(first, first)).toBe(true);
    expect(confirmsReset(first, first + 1)).toBe(true);
    expect(confirmsReset(first, first + window - 1)).toBe(true);
    expect(confirmsReset(first, first + window)).toBe(false);
  });

  it('does not count when it comes late, however late the label went back', () => {
    expect(confirmsReset(first, first + window + 1)).toBe(false);
    expect(confirmsReset(first, first + 60 * 60 * 1000)).toBe(false);
  });

  it('does not count with no first press, or when the clock has gone backwards', () => {
    expect(confirmsReset(null, first)).toBe(false);
    expect(confirmsReset(first, first - 1)).toBe(false);
    expect(confirmsReset(first, first - 24 * 60 * 60 * 1000)).toBe(false);
  });

  it('waits a few seconds, long enough to press twice without hurry', () => {
    expect(RESET_WINDOW).toBeGreaterThanOrEqual(3);
    expect(RESET_WINDOW).toBeLessThanOrEqual(10);
  });
});

describe('the cabinet and its save', () => {
  it('offers a reset that is not armed, and says the machine is kept on this device', () => {
    const html = render(<PlayTab />);
    expect(html).toMatch(/<button[^>]*data-armed="false"[^>]*data-testid="pusher-reset"[^>]*>Reset the machine<\/button>/);
    expect(html).toContain('This machine is saved on this device.');
    expect(html).not.toContain('Press again to reset');
    // Until a save has been tried, the note is the one the server sent: the page cannot know better yet.
    expect(html).toMatch(/<p[^>]*data-saved="true"[^>]*data-testid="pusher-saved"[^>]*>This machine is saved on this device\./);
    expect(html).not.toContain('could not be saved');
  });

  it('has words for a machine that could not be saved, in both languages', () => {
    const en = getStrings('en');
    const ja = getStrings('ja');
    expect(en.unsavedNote).toContain('could not be saved');
    expect(ja.unsavedNote).toContain('保存できませんでした');
    expect(en.unsavedNote).not.toBe(en.savedNote);
    expect(ja.unsavedNote).not.toBe(ja.savedNote);
  });

  it('says so in Japanese', () => {
    const html = render(<PlayTab />, 'ja');
    expect(html).toMatch(/data-testid="pusher-reset"[^>]*>マシンをリセット<\/button>/);
    expect(html).toContain('メダルはこの端末に預けてあります。');
    const ja = getStrings('ja');
    expect(ja.sayReset(START_CREDITS)).toContain(`${START_CREDITS}枚`);
    expect(getStrings('en').sayReset(START_CREDITS)).toContain(`${START_CREDITS} medals`);
    expect(ja.resetConfirm).not.toBe(ja.reset);
  });

  it('renders a new machine on the server whatever the browser remembers, and never touches storage there', () => {
    // A save with a medal played, in a storage that counts every call made to it.
    const session = createSession(9);
    insert(session, 50);
    const calls: string[] = [];
    const storage = {
      getItem: (key: string) => {
        calls.push(`get ${key}`);
        return key === STORAGE_KEY ? serialize(session) : null;
      },
      setItem: (key: string) => void calls.push(`set ${key}`),
      removeItem: (key: string) => void calls.push(`remove ${key}`),
    };
    vi.stubGlobal('localStorage', storage);
    vi.stubGlobal('window', { localStorage: storage });

    const html = render(<PlayTab />);
    expect(calls).toEqual([]);
    // The first render is the default machine, so the browser's first render matches it too.
    expect(html).toMatch(new RegExp(`data-testid="pusher-credits"[^>]*>${START_CREDITS}<`));
    expect(html).toMatch(new RegExp(`data-testid="pusher-jackpot"[^>]*>${JACKPOT_START}<`));
    expect(html).toMatch(/data-testid="pusher-played"[^>]*>0</);
  });
});
