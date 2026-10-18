'use client';

import { Fragment } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { isFloorGame } from '@/lib/medalFloor/games';
import { linked } from '@/lib/medalFloor/jackpot';
import { getGameCoverPath } from '../constants/games';
import type { GameLanguage } from '../constants/gameTranslations';
import { WIDE_ZONES, ZONE_SIGNS, cornersOf, isNewMachine, nameWords, pitchOf, plateReturn, spansOf, zoneOf } from './floorPlan';
import { MedalTray } from './MedalTray';
import type { CenterStrings } from './strings';
import styles from './MachineFloor.module.css';

export interface OpenMachine {
  id: string;
  path: string;
}

interface MachineFloorProps {
  machines: readonly OpenMachine[];
  language: GameLanguage;
  t: CenterStrings;
}

const isLinked = (id: string): boolean => isFloorGame(id) && linked(id);

/**
 * The floor of machines, laid out as a real medal floor is: corner by corner,
 * each under its hanging sign, each machine a small cabinet with its name lit
 * over its screen, the stickers that matter (NEW, linked to the floor jackpot)
 * on the glass, and on its plate a line of what it is and its best return.
 * The whole cabinet is the way in.
 */
export function MachineFloor({ machines, language, t }: MachineFloorProps) {
  const { t: translate } = useTranslation();
  const locale = language === 'ja' ? 'ja-JP' : 'en-US';
  const other: GameLanguage = language === 'ja' ? 'en' : 'ja';
  const percent = (value: number) => `${value.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
  const corners = cornersOf(machines);
  const spans = spansOf(corners);
  const anyNew = machines.some(({ id }) => isNewMachine(id));
  const anyLinked = machines.some(({ id }) => isLinked(id));

  return (
    <>
      {/* The key to the stickers and the plates. */}
      <div className={styles.legend} data-testid="center-legend">
        {(anyLinked || anyNew) && (
          <ul className={styles.legendList} aria-label={t.legendTitle}>
            {anyLinked && (
              <li>
                <span className={styles.jp}>{t.jpBadge}</span> {t.legendJp}
              </li>
            )}
            {anyNew && (
              <li>
                <span className={styles.new}>{t.newBadge}</span> {t.legendNew}
              </li>
            )}
          </ul>
        )}
        <p className={styles.legendNote}>{t.legendReturn}</p>
      </div>

      <div className={styles.plan} data-testid="center-machines">
        {corners.map(({ zone, machines: here }, index) => {
          const titleId = `center-zone-${zone}-title`;
          const { span, squeezed, tall } = spans[index];
          return (
            <div key={zone} className={styles.zone} data-zone={zone} data-width={span} data-squeezed={squeezed} data-tall={tall} data-testid={`center-zone-${zone}`}>
              {/* The sign over the corner, hung from the ceiling. */}
              <div className={styles.sign}>
                <h3 id={titleId} className={styles.signTitle}>
                  <span className={styles.signMain}>{ZONE_SIGNS[zone][language]}</span>
                  <span className={styles.signSub} lang={other} aria-hidden>
                    {ZONE_SIGNS[zone][other]}
                  </span>
                </h3>
                <span className={styles.signCount}>{t.machineCount(here.length)}</span>
              </div>
              <ul className={styles.tiles} aria-labelledby={titleId}>
                {here.map(({ id, path }) => {
                  const name = translate(`games.${id}.title`);
                  const fresh = isNewMachine(id);
                  const jp = isLinked(id);
                  const back = plateReturn(id);
                  const wide = WIDE_ZONES.has(zoneOf(id));
                  return (
                    <li key={id} className={styles.tile} data-open="true" data-machine={id} data-zone={zone} data-wide={wide} data-new={fresh} data-linked={jp}>
                      {/* The lit name over the cabinet. Its link covers the whole cabinet. */}
                      <h4 className={styles.name}>
                        <Link href={path} className={styles.link} data-testid={`center-play-${id}`}>
                          {nameWords(id, name).map((word, i) => (
                            <Fragment key={i}>
                              {i > 0 && <wbr />}
                              {word}
                            </Fragment>
                          ))}
                        </Link>
                      </h4>
                      <div className={styles.screen}>
                        <Image src={getGameCoverPath(id)} alt="" fill sizes={wide ? '(min-width: 1040px) 300px, (min-width: 680px) 30vw, 92vw' : '(min-width: 1040px) 250px, (min-width: 680px) 24vw, (min-width: 480px) 31vw, 46vw'} />
                        {(fresh || jp) && (
                          <span className={styles.stickers}>
                            {fresh && (
                              <span className={styles.new} data-testid={`center-new-${id}`}>
                                <span aria-hidden>{t.newBadge}</span>
                                <span className={styles.srOnly}>{t.newSay}</span>
                              </span>
                            )}
                            {jp && (
                              <span className={styles.jp} data-testid={`center-jp-${id}`}>
                                <span aria-hidden>{t.jpBadge}</span>
                                <span className={styles.srOnly}>{t.jpSay}</span>
                              </span>
                            )}
                          </span>
                        )}
                      </div>
                      {/* A cabinet as tall as the corner beside it: the lower body of a medal machine, its tray of medals. */}
                      {tall && <MedalTray />}
                      <div className={styles.plate}>
                        <p className={styles.pitch} data-testid={`center-pitch-${id}`}>
                          {pitchOf(id, language) ?? translate(`games.${id}.description`)}
                        </p>
                        <p className={styles.foot}>
                          {back && (
                            <span className={styles.best} data-testid={`center-best-${id}`}>
                              {back.least === null ? t.bestReturn(percent(back.most)) : t.returnRange(percent(back.least), percent(back.most))}
                            </span>
                          )}
                          <span className={styles.playMark} aria-hidden>
                            ▶<span className={styles.playWord}> {t.play}</span>
                          </span>
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </>
  );
}

export default MachineFloor;
