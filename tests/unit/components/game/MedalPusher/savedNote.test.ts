import { describe, expect, it } from 'vitest';

import type { Status } from '@/components/game/MedalPusher/account';
import { getStrings } from '@/components/game/MedalPusher/i18n';
import { savedNoteFor } from '@/components/game/MedalPusher/savedNote';

const WHERES: Status['where'][] = ['device', 'account', 'offline', 'unreadable', 'checking'];
const LANGUAGES = ['en', 'ja'] as const;

/**
 * What a note can say, and the words each language says it in. The notes are read for these: a note that says a
 * thing must be shown only when that thing is true.
 */
const CLAIMS = {
  en: {
    deviceHasACopy: /is saved on this device|is kept on this device|this device keeps a copy/i,
    deviceHasNoCopy: /could not be saved on this device|this device could not (keep|save)/i,
    startsAgainOnReload: /will start again when the page is reloaded/i,
    lostIfClosed: /is lost/i,
    onTheAccount: /is saved to your account/i,
    accountNotReached: /could not reach your account/i,
    accountUnreadable: /cannot be read by this page/i,
    lookingOnTheAccount: /looking for the machine saved to your account/i,
  },
  ja: {
    deviceHasACopy: /この端末に保存してあり|この端末にも控えが残ります|この端末にだけ保存しています/,
    deviceHasNoCopy: /保存できませんでした/,
    startsAgainOnReload: /マシンは最初からになります/,
    lostIfClosed: /失われます/,
    onTheAccount: /このマシンはアカウントに保存してあります/,
    accountNotReached: /アカウントに接続でき(ません|ず)/,
    accountUnreadable: /読み取れません/,
    lookingOnTheAccount: /アカウントに保存したマシンを確認しています/,
  },
} as const;

type Claim = keyof (typeof CLAIMS)['en'];

/** What is true of each claim, for a status. */
const truth = ({ where, kept }: Status): Record<Claim, boolean> => ({
  // The note for the moment the account is being looked for says nothing of this device while all is well with it.
  deviceHasACopy: kept && where !== 'checking',
  deviceHasNoCopy: !kept,
  // With nothing on the account either, a reload starts a new machine. With the account out of reach, what has not
  // been sent is lost if the page goes. Otherwise the account's machine is what a reload brings back.
  startsAgainOnReload: !kept && where === 'device',
  lostIfClosed: !kept && where === 'offline',
  onTheAccount: where === 'account',
  accountNotReached: where === 'offline',
  accountUnreadable: where === 'unreadable',
  lookingOnTheAccount: where === 'checking',
});

describe('the note that says where the machine is kept', () => {
  describe.each(LANGUAGES)('in %s', (language) => {
    const strings = getStrings(language);

    it.each(WHERES.flatMap((where) => [true, false].map((kept) => ({ where, kept }))))('says what is true, and nothing that is not, when the copy is $where and kept on the device is $kept', (status) => {
      const text = strings[savedNoteFor(status)];
      expect(typeof text).toBe('string');
      const said = Object.fromEntries(Object.entries(CLAIMS[language]).map(([claim, words]) => [claim, words.test(text)]));
      expect(said).toEqual(truth(status));
    });

    it('never says this device keeps a copy when the last write to it did not take', () => {
      for (const where of WHERES) {
        const text = strings[savedNoteFor({ where, kept: false })];
        expect(text).not.toMatch(CLAIMS[language].deviceHasACopy);
        expect(text).toMatch(CLAIMS[language].deviceHasNoCopy);
      }
    });

    it('has a note of its own for every case', () => {
      const texts = WHERES.flatMap((where) => [true, false].map((kept) => strings[savedNoteFor({ where, kept })]));
      expect(new Set(texts).size).toBe(WHERES.length * 2);
      for (const text of texts) expect(text.length).toBeGreaterThan(10);
    });
  });

  it('says the same in both languages for every case', () => {
    for (const where of WHERES) {
      for (const kept of [true, false]) {
        const key = savedNoteFor({ where, kept });
        const said = (language: (typeof LANGUAGES)[number]) => Object.entries(CLAIMS[language]).map(([claim, words]) => [claim, words.test(getStrings(language)[key])]);
        expect(said('ja')).toEqual(said('en'));
      }
    }
  });
});
