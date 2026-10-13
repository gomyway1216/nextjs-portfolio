import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FeelControls, FeelNote } from '@/components/game/MedalPusher/FeelControls';
import { AIM_RANGE, POCKETS_IN_REACH, PlayTab, aimPercent, sliderShare } from '@/components/game/MedalPusher/PlayTab';
import { ARM_REACH, CHECKERS } from '@/components/game/MedalPusher/engine';
import { FEEL_KEY, writeFeel } from '@/components/game/MedalPusher/feel';
import { getStrings } from '@/components/game/MedalPusher/i18n';
import { createI18nInstance } from '@/lib/i18n';

const render = (node: React.ReactNode, lang: 'en' | 'ja' = 'en') =>
  renderToStaticMarkup(<I18nextProvider i18n={createI18nInstance(lang)}>{node}</I18nextProvider>);

/** The game's stylesheet, with its comments taken out: what the rules say. */
const stylesheet = () => readFileSync(join(process.cwd(), 'src/components/game/MedalPusher/MedalPusher.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
/** The control panel's own sheet, which draws the controls as parts of a machine. */
const panelSheet = () => readFileSync(join(process.cwd(), 'src/components/game/MedalPusher/ControlPanel.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
/** Every rule for exactly this selector, from the top of the sheet down, joined: later ones add to earlier ones. */
const rulesFor = (css: string, selector: string): string => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [...css.matchAll(new RegExp(`(?:^|[},])\\s*${escaped}\\s*(?:,[^{]*)?\\{([^}]*)\\}`, 'gm'))].map((match) => match[1]).join('\n');
};
const button = (html: string, id: string) => html.match(new RegExp(`<button[^>]*data-testid="${id}"[^>]*>[\\s\\S]*?</button>`))?.[0] ?? '';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the switches of feel', () => {
  it('are a row of their own at the end of the controls, with Sweep in it and off', () => {
    const html = render(<PlayTab />);
    const controls = html.split('data-testid="pusher-controls"')[1].split('data-testid="pusher-keys"')[0];
    // After everything that was there, in the order a thumb finds them.
    const order = ['pusher-feed-left', 'pusher-credits', 'pusher-feed-right', 'pusher-aim-left', 'pusher-aim-right', 'pusher-auto', 'pusher-sound', 'pusher-sound-settings', 'pusher-feel', 'pusher-sweep'].map(
      (id) => controls.indexOf(`data-testid="${id}"`),
    );
    expect(order.every((at) => at > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(controls).toMatch(/<div[^>]*role="group"[^>]*aria-label="Ways to play"/);
    const sweep = button(html, 'pusher-sweep');
    expect(sweep).toContain('aria-pressed="false"');
    expect(sweep).toContain('type="button"');
    expect(sweep).toMatch(/<svg[^>]*aria-hidden="true"/);
    expect(sweep).toMatch(/>\s*Swing<\/button>/);
    expect(sweep).toContain('title="The rails swing left and right by themselves');
  });

  it('show nothing of the device on the server: no vibration, no fullscreen, whatever the browser will turn out to have', () => {
    // A server that happens to have a navigator with a motor and a document that can fill a screen.
    vi.stubGlobal('navigator', { vibrate: () => true, maxTouchPoints: 5 });
    vi.stubGlobal('document', { fullscreenEnabled: true });
    const html = render(<PlayTab />);
    expect(html).toContain('data-testid="pusher-sweep"');
    expect(html).not.toContain('pusher-vibration');
    expect(html).not.toContain('pusher-fullscreen');
    // Nothing stands in for them either: the row holds one button.
    const row = html.split('data-testid="pusher-feel"')[1].split('</div>')[0];
    expect(row.match(/<button/g)).toHaveLength(1);
  });

  it('read nothing the browser remembers during the first render', () => {
    const calls: string[] = [];
    const storage = {
      getItem: (key: string) => {
        calls.push(key);
        return key === FEEL_KEY ? writeFeel({ vibration: true, sweep: true }) : null;
      },
      setItem: (key: string) => void calls.push(key),
      removeItem: (key: string) => void calls.push(key),
    };
    vi.stubGlobal('localStorage', storage);
    vi.stubGlobal('window', { localStorage: storage });
    const html = render(<PlayTab />);
    expect(calls).toEqual([]);
    // So the first render is that of a player who chose nothing: Sweep off, no line about it, no marks over the sliders.
    expect(button(html, 'pusher-sweep')).toContain('aria-pressed="false"');
    expect(html).not.toContain('pusher-sweep-note');
    expect(html).not.toContain('pusher-lead-left');
    expect(html).not.toContain('pusher-lead-right');
  });

  it('show each switch only where the device can do it, pressed or not, with a name and what it does', () => {
    const t = getStrings('en');
    const none = () => undefined;
    const all = render(<FeelControls strings={t} sweep={true} onSweep={none} vibration={true} onVibration={none} />);
    expect(button(all, 'pusher-sweep')).toContain('aria-pressed="true"');
    expect(button(all, 'pusher-vibration')).toContain('aria-pressed="true"');
    expect(button(all, 'pusher-vibration')).toMatch(/>\s*Vibrate<\/button>/);
    expect(button(all, 'pusher-vibration')).toContain('title="The phone ticks when a medal goes in and buzzes for a win."');
    // While the rails swing, a line says what to do about it. It is a piece of its own, so that it can come last in
    // the controls, after the row the sound settings open in; it is nothing at all while they do not swing.
    expect(all).not.toContain('pusher-sweep-note');
    expect(render(<FeelNote strings={t} sweep={true} />)).toMatch(
      /^<p[^>]*data-testid="pusher-sweep-note"[^>]*>Swing: the rails move by themselves\. Press L or R when the ▼ over a slider is where the medal should drop\.<\/p>$/,
    );
    expect(render(<FeelNote strings={t} sweep={false} />)).toBe('');
    // Fullscreen is the browser's to offer, and nothing has offered it here.
    expect(all).not.toContain('pusher-fullscreen');

    const off = render(<FeelControls strings={t} sweep={false} onSweep={none} vibration={false} onVibration={none} />);
    expect(button(off, 'pusher-sweep')).toContain('aria-pressed="false"');
    expect(button(off, 'pusher-vibration')).toContain('aria-pressed="false"');
    expect(off).not.toContain('pusher-sweep-note');

    // No motor: no switch, and nothing in its place.
    const bare = render(<FeelControls strings={t} sweep={false} onSweep={none} vibration={null} onVibration={none} />);
    expect(bare).not.toContain('pusher-vibration');
    expect(bare.match(/<button/g)).toHaveLength(1);
  });

  it('are named in Japanese too', () => {
    const none = () => undefined;
    const html = render(<FeelControls strings={getStrings('ja')} sweep={true} onSweep={none} vibration={true} onVibration={none} />, 'ja');
    expect(html).toContain('aria-label="遊び方の設定"');
    expect(button(html, 'pusher-sweep')).toMatch(/>\s*スイング<\/button>/);
    expect(button(html, 'pusher-vibration')).toMatch(/>\s*振動<\/button>/);
    expect(render(<FeelNote strings={getStrings('ja')} sweep={true} />, 'ja')).toContain('スイング中: レールが自動で振れます。');
    expect(render(<PlayTab />, 'ja')).toMatch(/data-testid="pusher-sweep"[^>]*>[\s\S]*?スイング<\/button>/);
  });

  it('have words for everything in both languages, and none of them the same as another', () => {
    const keys = ['feelLabel', 'swing', 'swingHint', 'swingNote', 'saySwingOn', 'saySwingOff', 'saySwingTaken', 'vibration', 'vibrationHint', 'fullscreen', 'fullscreenHint'] as const;
    for (const language of ['en', 'ja'] as const) {
      const t = getStrings(language);
      const words = keys.map((key) => t[key]);
      for (const word of words) expect(word.length).toBeGreaterThan(0);
      expect(new Set(words).size).toBe(keys.length);
    }
    const en = getStrings('en');
    const ja = getStrings('ja');
    for (const key of keys) expect(ja[key]).not.toBe(en[key]);
    // What is said when a hand takes over is not what is said when the switch is thrown.
    expect(en.saySwingTaken).toContain('aiming by hand');
    expect(ja.saySwingTaken).toContain('手動');
    expect(en.fullscreen).toBe('Fullscreen');
    // The aim that swings by itself is Swing on the cabinet: an older test keeps the game's words clear of the gates it once had, and of their sweep.
    expect(en.swing).toBe('Swing');
    expect(ja.swing).toBe('スイング');
    expect(ja.fullscreen).toBe('全画面');
  });
});

describe('the marks over a slider while the rails swing', () => {
  it('are placed along the slider by how far across its own range a spot is', () => {
    for (const arm of [0, 1] as const) {
      expect(sliderShare(arm, AIM_RANGE[arm].min)).toBe(0);
      expect(sliderShare(arm, AIM_RANGE[arm].max)).toBe(1);
      expect(sliderShare(arm, (AIM_RANGE[arm].min + AIM_RANGE[arm].max) / 2)).toBeCloseTo(0.5, 9);
      // A spot the rail cannot reach is at the end it is beyond.
      expect(sliderShare(arm, AIM_RANGE[arm].min - 20)).toBe(0);
      expect(sliderShare(arm, AIM_RANGE[arm].max + 20)).toBe(1);
    }
    // The middle of the field is far along the left rail's slider and near the start of the right rail's.
    expect(sliderShare(0, 50)).toBeGreaterThan(0.75);
    expect(sliderShare(1, 50)).toBeLessThan(0.25);
    expect(sliderShare(0, 50) + sliderShare(1, 50)).toBeCloseTo(1, 9);
  });

  it('mark the START pockets each rail can feed: the middle one for both, and its own side’s', () => {
    const [left, middle, right] = CHECKERS.positions.map(aimPercent);
    expect(POCKETS_IN_REACH).toEqual([
      [left, middle],
      [middle, right],
    ]);
    for (const arm of [0, 1] as const) {
      for (const pocket of POCKETS_IN_REACH[arm]) {
        expect(pocket).toBeGreaterThanOrEqual(AIM_RANGE[arm].min);
        expect(pocket).toBeLessThanOrEqual(AIM_RANGE[arm].max);
      }
    }
    expect(ARM_REACH[0].max).toBeLessThan(CHECKERS.positions[2]);
    expect(ARM_REACH[1].min).toBeGreaterThan(CHECKERS.positions[0]);
  });
});

describe('the stylesheet, for a thumb', () => {
  const css = stylesheet();

  it('lets nothing in the cabinet be selected, called out or zoomed by a double tap', () => {
    const cabinet = rulesFor(css, '.cabinet');
    expect(cabinet).toContain('user-select: none');
    expect(cabinet).toContain('-webkit-user-select: none');
    expect(cabinet).toContain('-webkit-touch-callout: none');
    expect(cabinet).toContain('touch-action: manipulation');
    // The feed buttons and the field allow less than that, and still say so themselves.
    expect(rulesFor(css, '.feed')).toContain('touch-action: none');
    expect(rulesFor(css, '.feed')).toContain('-webkit-touch-callout: none');
    expect(rulesFor(css, '.field')).toContain('touch-action: pan-y');
  });

  it('makes every control at least 44 px to hit', () => {
    // The switches and the tabs look as they did; a strip 44 px tall through the middle of each takes the touch.
    const strip = css.match(/\.toggle::after,\s*\.tab::after \{([^}]*)\}/)?.[1] ?? '';
    expect(strip).toContain("content: ''");
    expect(strip).toContain('position: absolute');
    expect(strip).toContain('height: 44px');
    expect(strip).toContain('top: 50%');
    expect(css).toMatch(/\.toggle,\s*\.tab \{\s*position: relative;\s*\}/);
    expect(css).toMatch(/\.refill,\s*\.reset \{\s*min-height: 44px;\s*\}/);
    // A slider is 44 px tall, and a swipe up or down it still scrolls the page: the aims' and the volume's alike.
    for (const name of ['.aimSlider', '.volumeSlider']) {
      const slider = rulesFor(css, name);
      expect(slider).toContain('height: 44px');
      expect(slider).toContain('touch-action: pan-y');
      expect(slider).toContain('appearance: none');
      // What it looks like is the panel's own sheet's, which draws every slider of the panel as a fader.
      for (const thumb of [`${name}::-webkit-slider-thumb`, `${name}::-moz-range-thumb`]) expect(rulesFor(css, thumb)).not.toMatch(/width|height|background/);
    }
    // The fader's cap is what a finger has to catch on a phone, where a tap on the slot does not move it: 28 px wide.
    const panel = panelSheet();
    for (const thumb of [".plate input[type='range']::-webkit-slider-thumb", ".plate input[type='range']::-moz-range-thumb"]) {
      expect(rulesFor(panel, thumb)).toContain('width: 28px');
      expect(rulesFor(panel, thumb)).toContain('height: 30px');
    }
    expect(panel).not.toMatch(/-webkit-slider[^{]*,[^{]*-moz-range|-moz-range[^{]*,[^{]*-webkit-slider/);
    // The volume's takes little more room in its row than a bare track did (its cap clears the words over it), and
    // the notch behind it, at the level the cabinet was made at, is still in the middle of its travel: a cap's
    // travel is the same at both ends.
    expect(rulesFor(css, '.volumeSlider')).toContain('margin: -8px 0 -12px');
    const notch = rulesFor(css, '.volumeTrack::before');
    expect(notch).toContain('left: 50%');
    expect(notch).toContain('pointer-events: none');
    // A WebKit rule and a Gecko rule never share a list: a browser drops a list it knows half of.
    expect(css).not.toMatch(/-webkit-slider[^{]*,[^{]*-moz-range|-moz-range[^{]*,[^{]*-webkit-slider/);
    // The feed buttons were big enough already, and stay so.
    expect(rulesFor(css, '.feed')).toMatch(/width: clamp\(4\.8rem, 23vw, 6rem\)/);
    // The marks along a slider take no touch from it.
    expect(rulesFor(panel, '.scale')).toContain('pointer-events: none');
  });

  it('keeps the page clear of a notch and a home bar', () => {
    const root = rulesFor(css, '.root');
    expect(root).toContain('env(safe-area-inset-left, 0px)');
    expect(root).toContain('env(safe-area-inset-right, 0px)');
    expect(root).toContain('env(safe-area-inset-bottom, 0px)');
    // Never less room than there was.
    expect(root).toMatch(/padding-left: max\(clamp\(0\.75rem, 3vw, 1\.5rem\), env/);
    expect(root).toMatch(/padding-bottom: max\(3rem, env/);
  });

  it('lays the cabinet out to fill the screen, clear of the notch, with nothing behind it to scroll', () => {
    const full = rulesFor(css, '.cabinet:fullscreen');
    for (const side of ['top', 'right', 'bottom', 'left']) expect(full).toContain(`env(safe-area-inset-${side}, 0px)`);
    expect(full).toContain('overscroll-behavior: none');
    expect(full).toContain('height: 100%');
    expect(full).toContain('max-width: none');
    // The stage takes the room that is left, and the picture is as large as fits in it, in its own shape.
    const stage = rulesFor(css, '.cabinet:fullscreen .fieldWrap');
    expect(stage).toContain('flex: 1 1 0');
    expect(stage).toContain('min-height: 0');
    expect(stage).toContain('container-type: size');
    const sheets = css.match(/\.cabinet:fullscreen \.wallSpace,\s*\.cabinet:fullscreen \.scene,\s*\.cabinet:fullscreen \.field \{([^}]*)\}/)?.[1] ?? '';
    expect(sheets).toContain('width: min(100cqw, 100cqh * 640 / 860)');
    expect(sheets).toContain('aspect-ratio: 640 / 860');
    // A pixel of the drawing follows the picture's width, for the room the screen stands in and for the screen's sheet.
    expect(rulesFor(css, '.cabinet:fullscreen .wallSpace')).toContain('--mp-u: calc(min(100cqw, 100cqh * 640 / 860) / 640)');
    expect(rulesFor(css, '.cabinet:fullscreen .wall')).toContain('--mp-u: calc(100cqw / 640)');
    // There a finger on the field is aiming whichever way it goes.
    expect(rulesFor(css, '.cabinet:fullscreen .field')).toContain('touch-action: none');
    // On its side the controls are at either hand, each rail's on its own side.
    const sideways = css.split('@media (orientation: landscape)')[1] ?? '';
    expect(sideways).toMatch(/'feedL stage feedR'/);
    expect(sideways).toMatch(/'aimL stage aimR'/);
    // The sound settings open at the right hand, under the switches that open them; the line about Swing is at the left.
    expect(sideways).toMatch(/'feel stage sound'\s*'note stage refill'/);
    expect(sideways).toMatch(/\.cabinet:fullscreen \.soundPanel \{\s*grid-area: sound;/);
    expect(sideways).toMatch(/\.cabinet:fullscreen \.feelNote \{\s*grid-area: note;/);
    expect(sideways).toMatch(/\.cabinet:fullscreen \.feed\[data-arm='0'\] \{\s*grid-area: feedL;/);
    expect(sideways).toMatch(/\.cabinet:fullscreen \.feed\[data-arm='1'\] \{\s*grid-area: feedR;/);
  });

  it('gives the switches of feel a row without touching the panel’s own layout', () => {
    expect(rulesFor(css, '.feel')).toContain('grid-column: 1 / -1');
    expect(rulesFor(css, '.feelRow')).toContain('display: flex');
    // So have the sound settings and the line about Swing: each a row as wide as the panel, in the order they are written.
    expect(rulesFor(css, '.soundPanel')).toContain('grid-column: 1 / -1');
    expect(rulesFor(css, '.feelNote')).toContain('grid-column: 1 / -1');
    // The panel's three rows are as they were: the new row comes after them by itself.
    expect(rulesFor(css, '.panel')).toMatch(/'left credit right'\s*'aims aims aims'\s*'toggles toggles toggles';/);
  });
});
