/**
 * Renders the Blokus cover, public/img/games/covers/blokus.webp (960×540), SVG → sharp.
 *
 * The position is a real one: legal moves from the engine, played from the start with
 * a seeded random pick among the biggest pieces, as a game looks when everyone plays
 * sensibly. The squares come from the game's own path builders, so the cover is the
 * same plastic as the board. Only the colours are repeated here, as the game keeps
 * them in its stylesheet.
 *
 * Usage: node -r tsx/cjs scripts/blokus-cover.ts [--seed 11] [--moves 52] [--out path.webp]
 */

import sharp from 'sharp';
import { applyMove, cloneState, legalMoves, movePiece, newGame, passTurn, PIECES } from '../src/components/game/Blokus/engine';
import { facePath, litPath, markPath, platePath, shadePath, wellLipsPath, wellsPath, type Cells } from '../src/components/game/Blokus/pieceArt';

const option = (name: string, fallback: string) => {
  const at = process.argv.indexOf(`--${name}`);
  return at >= 0 ? (process.argv[at + 1] ?? fallback) : fallback;
};

const COLORS = [
  { high: '#7cb4ff', mid: '#2563eb', low: '#1a48b8', edge: '#173e9e', ink: '#ffffff', corner: '#2563eb' },
  { high: '#ffec99', mid: '#f2c20f', low: '#c99606', edge: '#94700a', ink: '#5c3e00', corner: '#f2c20f' },
  { high: '#ff8f8f', mid: '#dc2626', low: '#ad1a1a', edge: '#8a1616', ink: '#ffffff', corner: '#dc2626' },
  { high: '#6fe39b', mid: '#16a34a', low: '#107a38', edge: '#0e632e', ink: '#ffffff', corner: '#16a34a' },
];

/** A small seeded generator, so a seed always gives the same cover. */
const random = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 2 ** 32;
};

const playGame = (seed: number, moves: number) => {
  const next = random(seed);
  const game = cloneState(newGame('classic'));
  for (let played = 0; played < moves && !game.over; played++) {
    const options = legalMoves(game);
    if (options.length === 0) {
      passTurn(game);
      continue;
    }
    const biggest = Math.max(...options.map((move) => PIECES[movePiece(move)].size));
    const big = options.filter((move) => PIECES[movePiece(move)].size === biggest);
    applyMove(game, big[Math.floor(next() * big.length)]);
  }
  return game;
};

const plastic = (cells: Cells, color: number) => {
  const paint = COLORS[color];
  return `
    <path d="${platePath(cells)}" fill="#000" fill-opacity="0.28" transform="translate(0.06 0.1)"/>
    <path d="${platePath(cells)}" fill="${paint.low}" fill-opacity="0.88"/>
    <path d="${facePath(cells)}" fill="url(#face${color})"/>
    <path d="${shadePath(cells)}" fill="none" stroke="${paint.edge}" stroke-opacity="0.85" stroke-width="0.05" stroke-linecap="round"/>
    <path d="${litPath(cells)}" fill="none" stroke="#fff" stroke-opacity="0.62" stroke-width="0.045" stroke-linecap="round"/>
    <path d="${markPath(cells, color)}" fill="${paint.ink}" fill-opacity="0.62"/>`;
};

const gradients = COLORS.map(
  ({ high, mid, low }, color) => `
    <linearGradient id="face${color}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="1" spreadMethod="repeat">
      <stop offset="0.15" stop-color="${high}"/>
      <stop offset="0.5" stop-color="${mid}"/>
      <stop offset="0.86" stop-color="${low}"/>
    </linearGradient>`,
).join('');

const render = async (seed: number, moves: number, out: string) => {
  const game = playGame(seed, moves);
  const { size } = game.rules;
  const byColor: Array<Array<[number, number]>> = [[], [], [], []];
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const color = game.board[row * size + col];
      if (color >= 0) byColor[color].push([row, col]);
    }
  }

  // The board in cells, with a rim of 0.5 around it, tilted so it fills the frame and runs off the edges.
  const cell = 30;
  const rim = 0.5;
  const span = size + 2 * rim;
  const corner = 1.6;
  const corners = [
    `M${-rim} ${-rim}h${corner}l${-corner} ${corner}z`,
    `M${size + rim} ${-rim}v${corner}l${-corner} ${-corner}z`,
    `M${size + rim} ${size + rim}h${-corner}l${corner} ${-corner}z`,
    `M${-rim} ${size + rim}v${-corner}l${corner} ${corner}z`,
  ];

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540">
  <defs>
    ${gradients}
    <linearGradient id="well" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="1" spreadMethod="repeat">
      <stop offset="0.1" stop-color="#9ea5b0"/>
      <stop offset="0.55" stop-color="#bcc2ca"/>
    </linearGradient>
    <linearGradient id="rim" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#e6e9ee"/>
      <stop offset="1" stop-color="#a4abb6"/>
    </linearGradient>
    <radialGradient id="table" cx="0.5" cy="0.42" r="0.8">
      <stop offset="0" stop-color="#2b3550"/>
      <stop offset="1" stop-color="#0d1220"/>
    </radialGradient>
    <filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="0.5"/></filter>
  </defs>
  <rect width="960" height="540" fill="url(#table)"/>
  <g transform="translate(480 270) rotate(-14) scale(${cell}) translate(${-size / 2} ${-size / 2})">
    <rect x="${-rim + 0.25}" y="${-rim + 0.45}" width="${span}" height="${span}" rx="0.4" fill="#000" fill-opacity="0.5" filter="url(#soft)"/>
    <rect x="${-rim}" y="${-rim}" width="${span}" height="${span}" rx="0.4" fill="url(#rim)"/>
    ${corners.map((path, color) => `<path d="${path}" fill="${COLORS[color].corner}"/>`).join('')}
    <rect width="${size}" height="${size}" fill="#d3d7dd"/>
    <path d="${wellsPath(size)}" fill="url(#well)"/>
    <path d="${wellLipsPath(size)}" fill="none" stroke="#fff" stroke-opacity="0.75" stroke-width="0.035"/>
    ${byColor.map((cells, color) => plastic(cells, color)).join('')}
  </g>
</svg>`;

  await sharp(Buffer.from(svg)).resize(960, 540).webp({ quality: 88 }).toFile(out);
  console.log(`${out}: seed ${seed}, ${moves} plies, ${game.placed.join('+')} squares placed`);
};

render(Number(option('seed', '11')), Number(option('moves', '52')), option('out', 'public/img/games/covers/blokus.webp'));
