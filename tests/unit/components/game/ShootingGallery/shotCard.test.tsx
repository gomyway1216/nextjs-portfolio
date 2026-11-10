import { readFileSync } from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { CORKS, KINDS, SHELF, finishedShots, playOf, type Shot } from '@/components/game/ShootingGallery/engine';
import { getStrings } from '@/components/game/ShootingGallery/i18n';
import { parsePlay, playOfRecord, serializePlay, type PlayRecord } from '@/components/game/ShootingGallery/medalTable';
import { PlayReview, reviewedOf, type ReviewEntry } from '@/components/game/ShootingGallery/ShotCard';
import { drawFor } from './draws';

const TOP = 1;
const BASE = 4;
const BOX_AIMS: Shot[] = [[6, TOP], [7, TOP], [8, TOP], [3, TOP], [5, TOP], [0, TOP]];
const CAT_AIMS: Shot[] = [[1, BASE], [1, BASE], [1, TOP], [6, TOP], [7, TOP], [8, 0]];
const none = playOf(drawFor(BOX_AIMS, ['miss', 'rock', 'miss', 'rock', 'miss', 'rock']), BOX_AIMS);
const cat = playOf(drawFor(CAT_AIMS, ['slide', 'slide', 'fall', 'fall', 'rock', 'miss']), CAT_AIMS);
/**
 * A play left after two corks, the other four fired blind by the machine: as the app has it once it is settled, all six
 * corks among its shots and `own` saying how many were the player's (medalTable.ts `settle`).
 */
const LEFT_DRAW = drawFor(BOX_AIMS, ['fall', 'rock', 'miss', 'rock', 'miss', 'rock']);
const leftRecord: PlayRecord = { v: 1, id: 'left', owner: null, ledger: 'testdevice01', era: 0, draw: LEFT_DRAW, shots: finishedShots(LEFT_DRAW, BOX_AIMS.slice(0, 2)), paid: true, own: 2 };
const left = playOfRecord(leftRecord);

const HISTORY: ReviewEntry[] = [
  { id: 'c', play: left },
  { id: 'b', play: cat },
  { id: 'a', play: none },
];
const render = (lang: 'en' | 'ja', history: ReviewEntry[], chosen: string | null) => renderToStaticMarkup(<PlayReview t={getStrings(lang)} history={history} chosen={chosen} onChoose={() => undefined} />);
const rows = (markup: string) => [...markup.matchAll(/<li class="[^"]*shotRow[^"]*"[^>]*>.*?<\/li>/g)].map(([row]) => row);
const text = (markup: string) => markup.replace(/<[^>]*>/g, '|').replace(/\|+/g, '|');

describe('the play listed cork by cork', () => {
  it('is the latest play until one is picked, and the latest again once the one picked is gone', () => {
    expect(reviewedOf([], null)).toBeNull();
    expect(reviewedOf([], 'a')).toBeNull();
    expect(reviewedOf(HISTORY, null)?.id).toBe('c');
    expect(reviewedOf(HISTORY, 'a')?.id).toBe('a');
    expect(reviewedOf(HISTORY, 'gone')?.id).toBe('c');
  });

  it('keeps its room, and says what will be listed, before any play has ended', () => {
    for (const lang of ['en', 'ja'] as const) {
      const t = getStrings(lang);
      const markup = render(lang, [], null);
      expect(markup).toContain(t.historyEmpty);
      expect(markup).toContain(t.shotCardEmpty);
      expect(markup).toContain('data-testid="sht-shots" data-play=""');
      expect(markup).not.toContain('sht-history"');
      expect(rows(markup)).toHaveLength(0);
    }
    const css = readFileSync(path.join(process.cwd(), 'src/components/game/ShootingGallery/ShootingGallery.module.css'), 'utf8');
    expect(css).toMatch(/\.shotCard \{[^}]*min-height:/);
    // The line that stands in for the chips is as tall as one, and a chip is 44 px each way to tap.
    expect(css).toMatch(/\.historyEmpty \{[^}]*min-height: 44px/);
    expect(css).toMatch(/\.historyChip \{[^}]*min-height: 44px;\s*min-width: 44px/);
  });

  it('lists every cork of the play: its figure, the band the sight was on, and what the cork did', () => {
    const markup = render('en', HISTORY, 'b');
    expect(markup).toContain('data-play="b"');
    expect(markup).toContain('data-testid="sht-shots-of">2 figures off the shelf, the cat among them, 27 medals<');
    const list = rows(markup);
    expect(list).toHaveLength(CORKS);
    expect(list.map((row) => row.match(/data-outcome="(\w+)"/)?.[1])).toEqual(['slide', 'slide', 'fall', 'fall', 'rock', 'miss']);
    expect(text(list[0])).toContain('|1|Beckoning cat|Base|slid back|');
    expect(text(list[2])).toContain(`|3|Beckoning cat|Top edge|fell +${KINDS.cat.medals}|`);
    expect(text(list[3])).toContain('|4|Sweet box|Top edge|fell +2|');
    expect(text(list[5])).toContain('|6|Sweet box|Over the top|missed|');
    // What is listed adds up to what the play paid: only the figures that fell carry medals.
    const paid = cat.corks.filter((shot) => shot.outcome === 'fall').reduce((sum, shot) => sum + KINDS[SHELF[shot.target]].medals, 0);
    expect(paid).toBe(cat.won);
    // Each row is read out as one sentence; the cells are for the eye only.
    expect(list[2]).toContain('>Cork 3, at the beckoning cat, the top edge: it fell, 25 medals.<');
    expect(list[5]).toContain('>Cork 6, at the sweet box, over the top: it missed.<');
    for (const row of list) expect(row.match(/aria-hidden="true"/g)).toHaveLength(4);
  });

  it('is in Japanese too, the words read out among them', () => {
    const plain = (s: string) => s.replace(/​/g, '');
    const markup = plain(render('ja', HISTORY, 'b'));
    const list = rows(markup);
    expect(markup).toContain('>1発ずつの結果<');
    expect(text(list[0])).toContain('|1|招き猫|足もと|奥へずれた|');
    expect(text(list[2])).toContain('|3|招き猫|上の角|落ちた +25枚|');
    expect(list[2]).toContain('>3発目、招き猫（上の角）：落ちました。25枚。<');
    expect(list[4]).toContain('>5発目、お菓子の箱（上の角）：揺れて止まりました。<');
    expect(text(markup)).not.toMatch(/Cork|fell|missed|blind/);
  });

  it('marks the corks the machine fired blind for a play that was left', () => {
    expect(leftRecord.shots).toHaveLength(CORKS);
    expect(left.corks.map((shot) => shot.blind)).toEqual([false, false, true, true, true, true]);
    // Read back after a reload, the same; and the mark is all that differs from the play fired to its end by hand.
    const reread = parsePlay(serializePlay(leftRecord));
    expect(reread).toEqual(leftRecord);
    expect(playOfRecord(reread!).corks.map((shot) => shot.blind)).toEqual([false, false, true, true, true, true]);
    const byHand = playOf(LEFT_DRAW, leftRecord.shots);
    expect({ ...left, corks: left.corks.map((shot) => ({ ...shot, blind: false })) }).toEqual(byHand);
    const list = rows(render('en', HISTORY, null));
    expect(list.map((row) => row.match(/data-blind="(\w+)"/)?.[1])).toEqual(['false', 'false', 'true', 'true', 'true', 'true']);
    expect(text(list[1])).not.toContain('|blind|');
    expect(text(list[2])).toContain('|blind|');
    expect(list[2]).toMatch(/>Cork 3, fired blind at the [a-zū ]+, [a-z ]+: it [a-z0-9, ]+\.</);
    expect(rows(render('ja', HISTORY, null))[2]).toContain('>3発目、目をつぶって、');
  });

  it('has each of the last plays as a button, the one listed pressed', () => {
    const chips = (markup: string) => [...markup.matchAll(/<button[^>]*historyChip[^>]*>/g)].map(([chip]) => chip);
    const pressed = (markup: string) => chips(markup).map((chip) => chip.match(/aria-pressed="(\w+)"/)?.[1]);
    const latest = chips(render('en', HISTORY, null));
    expect(latest).toHaveLength(HISTORY.length);
    expect(pressed(render('en', HISTORY, null))).toEqual(['true', 'false', 'false']);
    expect(pressed(render('en', HISTORY, 'a'))).toEqual(['false', 'false', 'true']);
    expect(latest[1]).toContain('title="2 figures off the shelf, the cat among them, 27 medals"');
    expect(latest[1]).toContain('data-cat="true"');
    // The words on a chip are its name (what a voice command says); the longer line is its description.
    for (const chip of latest) expect(chip).not.toContain('aria-label');
    expect(latest[2]).toContain('title="Nothing off the shelf"');
  });
});
