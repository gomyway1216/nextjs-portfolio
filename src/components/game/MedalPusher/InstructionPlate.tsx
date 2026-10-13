'use client';

import { Fragment, useEffect, useId, useRef, useState, type MouseEvent } from 'react';
import type { GameLanguage } from '../constants/gameTranslations';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { BonusGlyph, HandGlyph, PathGlyph, StepArt, TowerGlyph } from './PlateArt';
import { PLATE_NOTES, PLATE_RULES, PLATE_STEPS, jackpotPath, payoutLines, type JackpotPath, type PayoutLine, type PlateRules } from './plateData';
import { getPlateStrings, type PlateStrings } from './plateStrings';
import { AIM_CAPS, KEY_CAPS } from './PlayTab';
import { ReelSymbol } from './ReelSymbols';
import styles from './InstructionPlate.module.css';

export { PlateSticker, PlateSwitch } from './PlateSticker';

/** The slot's reels: a line that one symbol makes is printed as that symbol on each of them. */
const REELS = 3;

/** One line of the payout card: its symbols, an arrow, and what three of them lead to. */
const Line = ({ line, rules, t }: { line: PayoutLine; rules: PlateRules; t: PlateStrings }) => {
  const shown = line.digits.length === 1 ? Array.from({ length: REELS }, () => line.digits[0]) : line.digits;
  const [low, high] = [line.prizes[0], line.prizes[line.prizes.length - 1]];
  // What a gold spin makes of this line, in chance time: printed after what the line pays.
  const gold = line.gold !== null && (
    <span className={styles.goldChip} data-plate-gold={line.gold}>
      <span aria-hidden>{t.gold(line.gold)}</span>
      <span className={styles.srOnly}>{t.goldSays(line.gold)}</span>
    </span>
  );
  return (
    <li className={styles.line} data-plate-line={line.tier} data-plate-leads={line.leads}>
      <span className={styles.symbols} aria-hidden>
        <span className={styles.tiles}>
          {shown.map((digit, index) => (
            <span key={index} className={styles.tile} data-plate-digit={digit}>
              <ReelSymbol digit={digit} />
            </span>
          ))}
        </span>
        {line.digits.length > 1 && <span className={styles.any}>{t.anyThree}</span>}
      </span>
      <span className={styles.srOnly}>{t.lineSays(line.digits)}</span>
      <span className={styles.leadsTo} aria-hidden />
      <span className={styles.bonus}>
        <span className={styles.bonusHead}>
          <span className={styles.bonusIcon} aria-hidden>
            <BonusGlyph leads={line.leads} />
          </span>
          <strong className={styles.bonusName}>{t.bonusName[line.leads]}</strong>
        </span>
        <span className={styles.bonusLine}>{t.bonusLine[line.leads](line, rules)}</span>
        {line.leads === 'chest' && (
          <span className={styles.prizes}>
            {line.prizes.map((medals) => {
              const stacked = line.towersFrom !== null && medals >= line.towersFrom;
              return (
                <span key={medals} className={styles.prize} data-plate-prize={medals} data-plate-tower={stacked}>
                  {t.medals(medals)}
                  {stacked && (
                    <span className={styles.prizeTower} aria-hidden>
                      <TowerGlyph />
                    </span>
                  )}
                </span>
              );
            })}
            {gold}
          </span>
        )}
        {line.leads === 'sugoroku' && (
          <span className={styles.prizes}>
            <span className={styles.prize} data-plate-prize-from={low} data-plate-prize-to={high}>
              {t.range(low, high)}
            </span>
            {line.fever !== null && (
              <span className={styles.prize} data-plate-fever={line.fever}>
                <span className={styles.feverTag}>{t.fever}</span>
                {t.medals(line.fever)}
              </span>
            )}
            {gold}
          </span>
        )}
        {line.leads === 'ball' && gold && <span className={styles.prizes}>{gold}</span>}
      </span>
    </li>
  );
};

/**
 * The way from a prize ball to the jackpot, drawn as two rows of stations
 * with an arrow from each to the next: the ball and the roulette it starts,
 * and under them the bowls a full run goes down, the top one first.
 */
const Path = ({ path, rules, t }: { path: JackpotPath; rules: PlateRules; t: PlateStrings }) => (
  <div className={styles.path} data-testid="pusher-plate-path">
    <p className={styles.pathTitle}>{t.pathTitle}</p>
    {/* The drawing is for the eye, and says the same as this. */}
    <p className={styles.srOnly}>{t.pathSays(path)}</p>
    <div className={styles.flow} aria-hidden>
      <div className={styles.leg} data-plate-leg="roulette">
        <div className={styles.station} data-plate-station="ball">
          <span className={styles.stationPic}>
            <PathGlyph stage="ball" rules={rules} />
          </span>
          <span className={styles.stationName}>{t.pathBall}</span>
        </div>
        <span className={styles.flowArrow} />
        <div className={styles.station} data-plate-station="roulette">
          <span className={styles.stationPic}>
            <PathGlyph stage="roulette" rules={rules} />
          </span>
          <span className={styles.stationName}>{t.pathRoulette}</span>
          <span className={styles.chips}>
            {path.pockets.map((medals) => (
              <span key={medals} className={styles.chip} data-plate-pocket={medals}>
                {medals}
              </span>
            ))}
          </span>
          <span className={styles.crossLine}>
            <span className={styles.cross} data-plate-crosses={path.crosses}>
              ×
            </span>
            {t.pathCross}
          </span>
        </div>
      </div>
      <p className={styles.gate} data-plate-chain={path.chainGoal}>
        {t.pathChain(path.chainGoal, path.bowls.length)}
      </p>
      <div className={styles.leg} data-plate-leg="bowls">
        {path.bowls.map((bowl, index) => (
          <Fragment key={index}>
            {index > 0 && <span className={styles.flowArrow} />}
            <div className={styles.station} data-plate-station="bowl" data-plate-bowl={index + 1} data-plate-down={bowl.down}>
              <span className={styles.stationPic}>
                <PathGlyph stage="bowl" bowl={index} rules={rules} />
              </span>
              <span className={styles.stationName}>{t.pathBowl(index + 1)}</span>
              <span className={styles.chips}>
                {bowl.prizes.map((medals) => (
                  <span key={medals} className={styles.chip} data-plate-hole={medals}>
                    {t.medals(medals)}
                  </span>
                ))}
                {bowl.jackpot > 0 && (
                  <span className={styles.jackpot} data-plate-jackpot={path.jackpotStart}>
                    <span className={styles.jackpotName}>{t.jackpot}</span>
                    <span className={styles.jackpotFrom}>{t.jackpotFrom(path.jackpotStart)}</span>
                  </span>
                )}
              </span>
            </div>
          </Fragment>
        ))}
      </div>
    </div>
    <p className={styles.grows} aria-hidden data-plate-grows={path.jackpotStep}>
      {/* What the arrow in a hole means, where any bowl has one. */}
      {path.bowls.some((bowl) => bowl.down > 0) && (
        <span className={styles.downKey}>
          <span className={styles.downMark} />
          {t.pathDown}
        </span>
      )}
      <span>
        {t.jackpot} {t.jackpotGrows(path.jackpotStep)}
      </span>
    </p>
  </div>
);

/** The strip of pictograms for the hands: the keys of a keyboard, and a finger on the buttons, the field and the sliders. */
const Hands = ({ t }: { t: PlateStrings }) => {
  const titleId = useId();
  return (
    <section className={styles.hands} aria-labelledby={titleId} data-testid="pusher-plate-hands">
      <h3 id={titleId} className={styles.handsTitle}>
        {t.handsTitle}
      </h3>
      {/* Both ways of working the machine are said in words. The pictograms are for the eye, and the stylesheet shows the keys only where there is likely to be a keyboard. */}
      <p className={styles.srOnly}>
        {t.keysSay(KEY_CAPS, AIM_CAPS)} {t.touchSay}
      </p>
      <div className={styles.handRow} data-plate-hands="keys" aria-hidden>
        <span className={styles.handKind}>{t.keysTitle}</span>
        <span className={styles.handItem}>
          <span className={styles.caps}>
            {KEY_CAPS.map((cap) => (
              <kbd key={cap} className={styles.cap}>
                {cap}
              </kbd>
            ))}
          </span>
          <span className={styles.handWord}>
            {t.feed}
            <small>{t.feedHold}</small>
          </span>
        </span>
        {AIM_CAPS.map((caps, arm) => (
          <span key={arm} className={styles.handItem}>
            <span className={styles.caps}>
              {caps.map((cap) => (
                <kbd key={cap} className={styles.cap}>
                  {cap}
                </kbd>
              ))}
            </span>
            <span className={styles.handWord}>{arm === 0 ? t.aimLeft : t.aimRight}</span>
          </span>
        ))}
      </div>
      <div className={styles.handRow} data-plate-hands="touch" aria-hidden>
        <span className={styles.handKind}>
          <span data-plate-pointer="touch">{t.touchTitle}</span>
          <span data-plate-pointer="mouse">{t.mouseTitle}</span>
        </span>
        {(
          [
            ['press', t.touchFeed],
            ['drag', t.touchAim],
            ['slide', t.touchSlider],
          ] as const
        ).map(([doing, word]) => (
          <span key={doing} className={styles.handItem}>
            <span className={styles.handPic}>
              <HandGlyph doing={doing} />
            </span>
            <span className={styles.handWord}>{word}</span>
          </span>
        ))}
      </div>
    </section>
  );
};

/**
 * The cabinet's instruction plate: the printed card a real machine carries
 * under a clear cover. The game's flow in numbered steps, each a drawing of
 * this machine's own part with one line of words; beside it the payout card,
 * which shows each line of the slot with its symbols and what it leads to,
 * and the way from a prize ball to the jackpot; a strip of pictograms for the
 * hands; and the cabinet's cautions.
 *
 * Nothing on it is typed in. It is printed from `rules`, which are the
 * lottery's own tables unless a test hands it others (plateData.ts).
 */
export const InstructionPlate = ({ language, rules = PLATE_RULES }: { language: GameLanguage; rules?: PlateRules }) => {
  const t = getPlateStrings(language);
  const flowId = useId();
  const payoutId = useId();
  return (
    <div className={styles.plate} data-plate-lang={language} data-testid="pusher-plate" lang={language}>
      <div className={styles.sheet}>
        <header className={styles.head}>
          <p className={styles.brand}>
            <span className={styles.brandName}>GOLDEN FEVER</span>
            <span className={styles.brandKind}>{t.kind}</span>
          </p>
          <h2 className={styles.title}>{t.title}</h2>
          <p className={styles.lead}>{t.lead}</p>
        </header>

        <div className={styles.colSteps}>
          <section className={styles.flowBlock} aria-labelledby={flowId}>
            <h3 id={flowId} className={styles.flowTitle}>
              {t.flowTitle}
            </h3>
            <ol className={styles.steps} data-testid="pusher-plate-steps">
              {PLATE_STEPS.map((step, index) => (
                <li key={step} className={styles.step} data-plate-step={step}>
                  <div className={styles.pic}>
                    <StepArt step={step} rules={rules} words={t.art} />
                    <span className={styles.num} data-plate-num={index + 1} aria-hidden>
                      {index + 1}
                    </span>
                  </div>
                  <p className={styles.stepHead}>{t.steps[step].head}</p>
                  <p className={styles.stepLine}>{t.steps[step].line(rules)}</p>
                </li>
              ))}
            </ol>
          </section>
          <Hands t={t} />
        </div>

        <div className={styles.colPayout}>
          <section className={styles.payout} aria-labelledby={payoutId} data-testid="pusher-plate-payout">
            <h3 id={payoutId} className={styles.payoutTitle}>
              <span className={styles.payoutTitleMain}>{t.payoutTitle}</span>
              <span className={styles.payoutTitleSub}>{t.payoutSub}</span>
            </h3>
            <ul className={styles.lines}>
              {payoutLines(rules).map((line) => (
                <Line key={line.tier} line={line} rules={rules} t={t} />
              ))}
            </ul>
            {PLATE_NOTES.map((note) => {
              const says = t.notes[note](rules);
              return (
                says && (
                  <p key={note} className={styles.note} data-plate-note={note}>
                    <strong className={styles.noteHead}>{says.head}</strong>
                    <span>{says.line}</span>
                  </p>
                )
              );
            })}
            <Path path={jackpotPath(rules)} rules={rules} t={t} />
            <p className={styles.oddsNote}>{t.oddsNote}</p>
          </section>
        </div>

        <footer className={styles.foot}>
          <div className={styles.caution}>
            <p className={styles.cautionTitle}>
              <svg className={styles.cautionMark} viewBox="0 0 24 22" aria-hidden focusable="false">
                <path d="M12 1.6L23 20.4H1Z" fill="#ffe14a" stroke="#1f1830" strokeWidth="2" strokeLinejoin="round" />
                <path d="M12 8v6" stroke="#1f1830" strokeWidth="2.4" strokeLinecap="round" />
                <circle cx="12" cy="17.2" r="1.4" fill="#1f1830" />
              </svg>
              <span>{t.cautionTitle}</span>
            </p>
            <ul className={styles.cautionList}>
              {t.cautions.map((caution) => (
                <li key={caution}>{caution}</li>
              ))}
            </ul>
          </div>
          <p className={styles.small}>{t.small}</p>
          <p className={styles.imprint} aria-hidden>
            <span>{t.imprint}</span>
            <span>{t.sheet}</span>
          </p>
        </footer>
      </div>
      {/* The cover: a clear sheet over the print, held down by a screw in each corner. */}
      <span className={styles.acrylic} aria-hidden />
      {(['nw', 'ne', 'sw', 'se'] as const).map((corner) => (
        <span key={corner} className={styles.screw} data-plate-corner={corner} aria-hidden />
      ))}
    </div>
  );
};

/**
 * The plate, taken off the cabinet and held up to read: what the How to play
 * button opens. It is a dialog of the browser's own, so the page behind it is
 * out of reach while it is up, the focus goes into it and comes back to
 * whatever opened it, and Escape closes it.
 *
 * Under the plate is the explanation it replaced, in full sentences, for
 * anyone who would rather read than look. That is in the page from the first
 * render, in the closed dialog, so that it can be found there. The plate
 * itself is a thousand strokes of drawing, and is printed when it is first
 * asked for: until then the page does not carry it.
 */
export const InstructionPlateDialog = ({ isOpen, onClose, title, body }: { isOpen: boolean; onClose: () => void; title: string; body: string[] }) => {
  const { language } = useGameLanguage();
  const t = getPlateStrings(language);
  const ref = useRef<HTMLDialogElement>(null);
  // Once printed it stays, so that it opens again at once.
  const [printed, setPrinted] = useState(isOpen);
  if (isOpen && !printed) setPrinted(true);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) {
      // A browser without modal dialogs still shows it, over the page.
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
      dialog.scrollTop = 0;
    } else if (!isOpen && dialog.open) {
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
    }
  }, [isOpen]);

  // A key pressed while the plate is up is not the machine's: the cabinet listens for its keys on the window, and
  // would feed medals behind the plate. Keys that come up are let through, so a key held when it opened is let go.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const keep = (event: KeyboardEvent) => event.stopPropagation();
    dialog.addEventListener('keydown', keep);
    return () => dialog.removeEventListener('keydown', keep);
  }, []);

  /** A press beside the plate, on what is behind it, closes it. */
  const onBackdrop = (event: MouseEvent<HTMLElement>) => {
    if (event.target === event.currentTarget) onClose();
  };

  return (
    <dialog ref={ref} className={styles.dialog} aria-label={title} data-testid="pusher-plate-dialog" onClose={onClose} onClick={onBackdrop}>
      <div className={styles.held} onClick={onBackdrop}>
        <button type="button" className={styles.close} aria-label={t.close} data-testid="pusher-plate-close" onClick={onClose}>
          <svg viewBox="0 0 24 24" aria-hidden focusable="false">
            <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
          </svg>
        </button>
        {printed && <InstructionPlate language={language} />}
        <details className={styles.text} data-testid="pusher-plate-text">
          <summary className={styles.textTitle}>{t.textTitle}</summary>
          {body.map((paragraph, index) => (
            <p key={index} className={styles.textP}>
              {paragraph}
            </p>
          ))}
        </details>
      </div>
    </dialog>
  );
};
