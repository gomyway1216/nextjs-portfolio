'use client';

import { useEffect, useImperativeHandle, useRef, type RefObject } from 'react';
import { AXIS, CAROUSEL, TURN_STEPS, STEP_RATE, angleAt, type Machine } from './engine';
import { deckBox, drawAir, drawCabinet, drawDeck, drawField, drawMark, drawPole, drawRail, drawSkirt, skirtBox } from './draw';
import { DEPTH_SQUASH, HEIGHTS, VIEW, airMedalAt, project, type AirMedal } from './view';
import styles from './CarouselPusher.module.css';

/** How long the carousel takes to turn once, in ms. */
export const TURN_MS = (TURN_STEPS / STEP_RATE) * 1000;

/**
 * What the page asks of the stage. While the machine is played, the page draws every frame (`frame`): the carousel
 * turned to the machine's angle, the medals in the air, and the field when it has moved. While it stands unplayed
 * and still (engine.ts `atRest`), the page lets it turn on its own (`turnAlone`): the compositor turns the deck and
 * slides the skirt round, and nothing else is drawn, so the page's main thread has nothing to do; `stopTurning` says
 * how many steps it turned meanwhile, for the machine to be turned on as far.
 */
export interface StageHandle {
  frame(m: Machine, frac: number, fieldMoved: boolean): void;
  field(m: Machine): void;
  stock(stock: number): void;
  /** Lets the carousel turn on its own from `step`; the moment (performance.now) it set off, or null if it was turning already. */
  turnAlone(step: number): number | null;
  stopTurning(): number;
}

interface StageProps {
  handle: RefObject<StageHandle | null>;
  /** What the stage shows, in words, for a screen reader. */
  label: string;
  /** The machine to draw first. */
  initial: () => Machine | null;
  calm: boolean;
  testId: string;
}

/** The deck's turn and the skirt's slide for an angle in degrees. */
const deckTransform = (deg: number) => `scaleY(${DEPTH_SQUASH}) rotate(${deg}deg)`;
const skirtTransform = (deg: number, s: number) => {
  const rad = (deg * Math.PI) / 180;
  return `translate(${(CAROUSEL.offset * Math.cos(rad) * s).toFixed(3)}px, ${(CAROUSEL.offset * Math.sin(rad) * DEPTH_SQUASH * s).toFixed(3)}px)`;
};

/**
 * The cabinet's field, as layers: the cabinet and the field (drawn once a size), the carousel's skirt and its deck (each
 * a picture moved, never drawn again while it turns), the pole with its dish and the rail, the field's medals, and the
 * medals in the air.
 */
export const Stage = ({ handle, label, initial, calm, testId }: StageProps) => {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const cabinetRef = useRef<HTMLCanvasElement | null>(null);
  const skirtSpot = useRef<HTMLDivElement | null>(null);
  const skirtRef = useRef<HTMLCanvasElement | null>(null);
  const deckSpot = useRef<HTMLDivElement | null>(null);
  const deckTurn = useRef<HTMLDivElement | null>(null);
  const deckRef = useRef<HTMLCanvasElement | null>(null);
  const poleRef = useRef<HTMLCanvasElement | null>(null);
  const fieldRef = useRef<HTMLCanvasElement | null>(null);
  const airRef = useRef<HTMLCanvasElement | null>(null);
  /** Device pixels a medal radius, and CSS pixels a medal radius. */
  const scale = useRef({ s: 0, css: 0 });
  const lastStock = useRef(-1);
  const lastMachine = useRef<Machine | null>(null);
  const turning = useRef<{ animations: Animation[]; since: number; step: number } | null>(null);
  const airDrawn = useRef(false);

  const sized = (canvas: HTMLCanvasElement | null, width: number, height: number) => {
    if (!canvas) return null;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    return canvas.getContext('2d');
  };

  /** The carousel turned to `deg` degrees: the deck turned, the skirt slid round. */
  const turnTo = (deg: number) => {
    if (deckTurn.current) deckTurn.current.style.transform = deckTransform(deg);
    if (skirtRef.current) skirtRef.current.style.transform = skirtTransform(deg, scale.current.css);
  };

  const drawFieldNow = (m: Machine) => {
    const { s } = scale.current;
    const canvas = fieldRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || s <= 0) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawField(ctx, s, m);
  };

  const drawStock = (stock: number) => {
    const { s } = scale.current;
    const canvas = poleRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || s <= 0) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawPole(ctx, s, stock);
    drawRail(ctx, s);
    drawMark(ctx, s);
    lastStock.current = stock;
  };

  /** Every layer drawn again at the stage's size: after a resize. */
  const layout = () => {
    const stage = stageRef.current;
    if (!stage) return;
    const box = stage.getBoundingClientRect();
    if (box.width <= 0) return;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.round(box.width * ratio));
    const height = Math.max(1, Math.round((width * VIEW.height) / VIEW.width));
    const s = width / VIEW.width;
    const css = box.width / VIEW.width;
    scale.current = { s, css };
    const cab = sized(cabinetRef.current, width, height);
    if (cab) drawCabinet(cab, s);
    sized(poleRef.current, width, height);
    sized(fieldRef.current, width, height);
    sized(airRef.current, width, height);
    // The skirt, placed with its top's middle over the pole's place at the deck's height.
    const skirt = skirtBox(s);
    const sctx = sized(skirtRef.current, skirt.width, skirt.height);
    if (sctx) drawSkirt(sctx, s);
    const top = project(AXIS.x, AXIS.y, HEIGHTS.deck);
    if (skirtSpot.current && skirtRef.current) {
      skirtSpot.current.style.left = `${top.x * css - skirt.cx / ratio}px`;
      skirtSpot.current.style.top = `${top.y * css - skirt.cy / ratio}px`;
      skirtRef.current.style.width = `${skirt.width / ratio}px`;
      skirtRef.current.style.height = `${skirt.height / ratio}px`;
    }
    const deck = deckBox(s);
    const dctx = sized(deckRef.current, deck.size, deck.size);
    if (dctx) drawDeck(dctx, s);
    if (deckSpot.current && deckRef.current) {
      deckSpot.current.style.left = `${top.x * css - deck.c / ratio}px`;
      deckSpot.current.style.top = `${top.y * css - deck.c / ratio}px`;
      deckSpot.current.style.width = `${deck.size / ratio}px`;
      deckSpot.current.style.height = `${deck.size / ratio}px`;
    }
    const m = lastMachine.current ?? initial();
    lastMachine.current = m;
    drawStock(m?.stock ?? 0);
    if (m) {
      drawFieldNow(m);
      if (!turning.current) turnTo(angleAt(m.step));
    }
    const t = turning.current;
    if (t) {
      // The skirt's slide is in pixels: started again at the new size, from where it has got to.
      for (const animation of t.animations) animation.cancel();
      turning.current = null;
      startTurning(t.step, t.since);
    }
  };

  /**
   * The compositor turning the carousel from `step`, set off at `since` (now, or earlier when the stage is laid out
   * again while it turns: the turn goes on from where it has got to, and `stopTurning` still counts from `since`).
   */
  const startTurning = (step: number, since = performance.now()): number | null => {
    const deck = deckTurn.current;
    const skirt = skirtRef.current;
    if (!deck || !skirt || typeof deck.animate !== 'function') return null;
    const css = scale.current.css;
    const frames = 72;
    const skirtFrames = Array.from({ length: frames + 1 }, (_, i) => ({ transform: skirtTransform((i * 360) / frames, css) }));
    const options: KeyframeAnimationOptions = { duration: TURN_MS, iterations: Infinity, easing: 'linear' };
    const animations = [deck.animate([{ transform: deckTransform(0) }, { transform: deckTransform(360) }], options), skirt.animate(skirtFrames, options)];
    const phase = ((angleAt(step) / 360) * TURN_MS + Math.max(0, performance.now() - since)) % TURN_MS;
    for (const animation of animations) animation.currentTime = phase;
    turning.current = { animations, since, step };
    return since;
  };

  /** Stops the carousel turning on its own; how many steps it turned. */
  const stopTurningNow = (): number => {
    const t = turning.current;
    if (!t) return 0;
    turning.current = null;
    const steps = Math.max(0, Math.round(((performance.now() - t.since) / 1000) * STEP_RATE));
    for (const animation of t.animations) animation.cancel();
    turnTo(angleAt(t.step + steps));
    return steps;
  };

  useImperativeHandle(handle, () => ({
    frame(m, frac, fieldMoved) {
      lastMachine.current = m;
      const { s } = scale.current;
      if (s <= 0) return;
      const deg = angleAt(m.step) + frac;
      turnTo(deg);
      if (fieldMoved) drawFieldNow(m);
      if (m.stock !== lastStock.current) drawStock(m.stock);
      const canvas = airRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;
      if (m.air.length === 0 && !airDrawn.current) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const now = m.step + frac;
      const deckAt = (qx: number, qy: number, at: number) => {
        const rad = ((angleAt(Math.floor(at)) + (at - Math.floor(at))) * Math.PI) / 180;
        return { x: AXIS.x + qx * Math.cos(rad) - qy * Math.sin(rad), y: AXIS.y + qx * Math.sin(rad) + qy * Math.cos(rad) };
      };
      const medals: AirMedal[] = [];
      for (const a of m.air) {
        const medal = airMedalAt(a, now, deckAt);
        if (medal) medals.push(medal);
      }
      drawAir(ctx, s, medals);
      airDrawn.current = medals.length > 0;
    },
    field(m) {
      lastMachine.current = m;
      drawFieldNow(m);
      if (m.stock !== lastStock.current) drawStock(m.stock);
      if (!turning.current) turnTo(angleAt(m.step));
      const ctx = airRef.current?.getContext('2d');
      if (ctx && airRef.current && m.air.length === 0) {
        ctx.clearRect(0, 0, airRef.current.width, airRef.current.height);
        airDrawn.current = false;
      }
    },
    stock(stock) {
      if (stock !== lastStock.current) drawStock(stock);
    },
    turnAlone(step) {
      if (turning.current) return null;
      return startTurning(step);
    },
    stopTurning() {
      return stopTurningNow();
    },
  }));

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    layout();
    if (typeof ResizeObserver === 'undefined') return;
    const watch = new ResizeObserver(() => layout());
    watch.observe(stage);
    return () => {
      watch.disconnect();
      stopTurningNow();
    };
    // The layers are drawn from refs; the stage is laid out again only when its size changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={styles.stage} ref={stageRef} role="img" aria-label={label} data-testid={testId} data-calm={calm ? 'true' : 'false'}>
      <canvas ref={cabinetRef} className={styles.layer} />
      <div ref={skirtSpot} className={styles.spot}>
        <canvas ref={skirtRef} className={styles.turning} data-testid={`${testId}-skirt`} />
      </div>
      <div ref={deckSpot} className={styles.spot}>
        <div ref={deckTurn} className={styles.deckTurn} data-testid={`${testId}-deck`}>
          <canvas ref={deckRef} className={styles.fill} />
        </div>
      </div>
      <canvas ref={poleRef} className={styles.layer} />
      <canvas ref={fieldRef} className={styles.layer} data-testid={`${testId}-field`} />
      <canvas ref={airRef} className={styles.layer} />
    </div>
  );
};

export default Stage;
