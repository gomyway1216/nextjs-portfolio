import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PlayTab } from '@/components/game/MedalPusher/PlayTab';
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

describe('the cabinet and its save', () => {
  it('offers a reset that is not armed, and says the machine is kept on this device', () => {
    const html = render(<PlayTab />);
    expect(html).toMatch(/<button[^>]*data-armed="false"[^>]*data-testid="pusher-reset"[^>]*>Reset the machine<\/button>/);
    expect(html).toContain('This machine is saved on this device.');
    expect(html).not.toContain('Press again to reset');
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
