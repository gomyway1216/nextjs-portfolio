import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PlayTab, RESET_WINDOW, confirmsReset } from '@/components/game/MedalPusher/PlayTab';
import { getStrings } from '@/components/game/MedalPusher/i18n';
import { JACKPOT_START } from '@/components/game/MedalPusher/lottery';
import { START_CREDITS, createSession } from '@/components/game/MedalPusher/session';
import { STORAGE_KEY, serialize } from '@/components/game/MedalPusher/storage';
import { createI18nInstance } from '@/lib/i18n';

import { insertAt } from './feeding';

const render = (node: React.ReactNode, lang: 'en' | 'ja' = 'en') =>
  renderToStaticMarkup(<I18nextProvider i18n={createI18nInstance(lang)}>{node}</I18nextProvider>);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the second press of a button that takes two (clearing the records)', () => {
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
  it('has no reset of its own, says the medals are the medal bank’s and where they are reset, and that the machine is kept on this device', () => {
    const html = render(<PlayTab />);
    expect(html).not.toContain('data-testid="pusher-reset"');
    expect(html).toMatch(/data-testid="pusher-bank-note"[^>]*>Your medals are not this machine’s: they are in your medal bank/);
    expect(html).toMatch(/<a[^>]*href="\/games\/medal-center"[^>]*data-testid="pusher-center-link"[^>]*>Go to the Medal Center<\/a>/);
    expect(html).toContain('This machine is saved on this device.');
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
    expect(html).toContain('このマシンはこの端末に預けてあります。');
    expect(html).toContain('メダルはこのマシンのものではなく、メダルバンクに預けてあります。');
    expect(html).toMatch(/data-testid="pusher-center-link"[^>]*>メダルゲームセンターへ<\/a>/);
    const ja = getStrings('ja');
    expect(ja.sayCenterReset).toContain('リセット');
    expect(getStrings('en').sayCenterReset).toContain('reset');
  });

  it('renders a new machine on the server whatever the browser remembers, and never touches storage there', () => {
    // A save with a medal played, in a storage that counts every call made to it.
    const session = createSession(9);
    insertAt(session, 50);
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
