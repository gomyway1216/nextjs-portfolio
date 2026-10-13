import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AutoIcon, MakersPlate, PanelWarning, SpeakerIcon } from '@/components/game/MedalPusher/ControlPanel';
import { MedalTray, TRAY_TONES } from '@/components/game/MedalPusher/MedalTray';
import { COUNTER_PLACES, JACKPOT_PLACES, PlayTab } from '@/components/game/MedalPusher/PlayTab';
import { SegmentDisplay, SegmentMirror } from '@/components/game/MedalPusher/SegmentDisplay';
import { getStrings } from '@/components/game/MedalPusher/i18n';
import { JACKPOT_START } from '@/components/game/MedalPusher/lottery';
import { HEAP_CAP, SEGMENTS, segmentsFor, washed } from '@/components/game/MedalPusher/panel';
import { FACES, faceOf } from '@/components/game/MedalPusher/render';
import { START_CREDITS } from '@/components/game/MedalPusher/session';
import { createI18nInstance } from '@/lib/i18n';

const render = (node: React.ReactNode, lang: 'en' | 'ja' = 'en') =>
  renderToStaticMarkup(<I18nextProvider i18n={createI18nInstance(lang)}>{node}</I18nextProvider>);

/** The control panel's own sheet, with its comments taken out. */
const panelSheet = () => readFileSync(join(process.cwd(), 'src/components/game/MedalPusher/ControlPanel.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const rulesFor = (css: string, selector: string): string => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [...css.matchAll(new RegExp(`(?:^|[},])\\s*${escaped}\\s*(?:,[^{]*)?\\{([^}]*)\\}`, 'gm'))].map((match) => match[1]).join('\n');
};
const button = (html: string, id: string) => html.match(new RegExp(`<button[^>]*data-testid="${id}"[^>]*>[\\s\\S]*?</button>`))?.[0] ?? '';
/** What a display in this markup shows, read back off its lit segments. */
const shown = (display: string): string =>
  [...display.matchAll(/<svg[\s\S]*?<\/svg>/g)]
    .map(([digit]) => {
      const lit = [...digit.matchAll(/data-on="(true|false)"/g)].map(([, on], index) => (on === 'true' ? 'abcdefg'[index] : '')).join('');
      return lit === '' ? '' : (Object.entries(SEGMENTS).find(([, segments]) => segments === lit)?.[0] ?? '?');
    })
    .join('');

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('a display of LED digits', () => {
  it('is a picture: every place has its seven segments, lit or not, and none of it is read out', () => {
    const html = render(<SegmentDisplay value={1234} places={5} />);
    expect(html).toMatch(/^<span[^>]*aria-hidden="true"/);
    expect(html.match(/<svg/g)).toHaveLength(5);
    expect(html.match(/<polygon/g)).toHaveLength(35);
    expect(shown(html)).toBe('1234');
    // The lit segments are exactly the number's: 2 + 5 + 5 + 4.
    expect(html.match(/data-on="true"/g)).toHaveLength(16);
    expect(html).toContain('data-tone="red"');
    expect(html).not.toMatch(/>\s*\d/);
  });

  it('shows whatever whole number it is given, and nothing where there is none', () => {
    for (const value of [0, 7, 42, 100, 999, 1234, 98765]) expect(shown(render(<SegmentDisplay value={value} places={5} />))).toBe(String(value));
    expect(shown(render(<SegmentDisplay value="1,234" places={4} tone="amber" />))).toBe('1234');
    expect(render(<SegmentDisplay value="" places={3} />)).not.toContain('data-on="true"');
    expect(render(<SegmentDisplay value={300} places={4} tone="amber" />)).toContain('data-tone="amber"');
  });

  it('shows the number that is written before it, starting with the one the server wrote', () => {
    const html = render(
      <>
        <span>300</span>
        <SegmentMirror initial={300} places={4} tone="amber" />
      </>,
    );
    expect(shown(html)).toBe('300');
    expect(html.indexOf('<span>300</span>')).toBeLessThan(html.indexOf('<svg'));
  });
});

describe('the tray', () => {
  it('holds as many medals as the purse, up to a full heap, and is a picture', () => {
    const medals = (credits: number) => {
      const html = render(<MedalTray credits={credits} />);
      const heap = html.split('<g data-part="heap">')[1]?.split('</g></svg>')[0] ?? '';
      return { html, drawn: (heap.match(/<g transform/g) ?? []).length };
    };
    expect(medals(0).drawn).toBe(0);
    expect(medals(1).drawn).toBe(1);
    expect(medals(25).drawn).toBe(25);
    expect(medals(HEAP_CAP).drawn).toBe(HEAP_CAP);
    expect(medals(98765).drawn).toBe(HEAP_CAP);
    const { html } = medals(25);
    expect(html).toMatch(/^<span[^>]*data-testid="pusher-tray"[^>]*data-heap="25"[^>]*aria-hidden="true"|^<span[^>]*aria-hidden="true"/);
    expect(html).toContain('data-heap="25"');
    expect(html).toContain('aria-hidden="true"');
    // Nothing is on its way in a tray that has only just been drawn, whatever its purse: every medal of it is lying
    // there. A machine that was remembered, or reset, or swapped for the account's, is drawn like this and no other way.
    expect(html).not.toMatch(/data-way=/);
    expect(html).toContain('data-lying="25"');
    for (const credits of [0, 37, 80, START_CREDITS, 1234]) {
      const put = medals(credits);
      expect(put.html).not.toMatch(/data-way=/);
      expect(put.html).toContain(`data-lying="${Math.min(HEAP_CAP, credits)}"`);
    }
    // The medals keep their shape whatever shape the tray has, and stand on its floor in the middle: the dish round
    // them is the sheet's, which stretches it.
    expect(html).toContain('preserveAspectRatio="xMidYMax meet"');
    expect(html).not.toMatch(/<rect/);
    const sheet = panelSheet();
    expect(rulesFor(sheet, '.tray')).toMatch(/background: linear-gradient/);
    expect(rulesFor(sheet, '.tray::after')).toContain('clip-path: polygon(');
  });

  it("holds the field's medals: worn brass in the field's own tones, not new gilt", () => {
    // Every tone a medal on the table can have gone to, struck in the colours the field's renderer strikes it in and
    // washed as it washes them: brass first, and then the tone's own wash.
    expect(TRAY_TONES).toHaveLength(FACES.length);
    expect(TRAY_TONES[0].face).toBe(washed('#dba21f', [FACES[0]]));
    FACES.forEach((wash, tone) => {
      const washes = tone === 0 ? [FACES[0]] : [FACES[0], wash];
      expect(TRAY_TONES[tone]).toEqual({
        light: washed('#fbd55a', washes),
        face: washed('#dba21f', washes),
        dark: washed('#b97c0c', washes),
        rim: washed('#a56a06', washes),
        edge: washed('#6a4204', washes),
        glint: washed('#fffbe0', washes),
      });
    });
    const html = render(<MedalTray credits={HEAP_CAP} />);
    // The bright gilt the tray's medals were first painted in is gone from it.
    for (const gilt of ['#fff1a8', '#f6c544', '#fff7c8']) expect(html).not.toContain(gilt);
    // A paint for each tone, and each medal of the heap in the tone the field gives a medal of its number.
    const paints = [...html.matchAll(/<radialGradient id="([^"]+)-(\d)"/g)].map(([, , tone]) => Number(tone));
    expect(paints).toEqual(FACES.map((_, tone) => tone));
    const tones = [...html.matchAll(/fill="url\(#[^)]*-(\d)\)"/g)].map(([, tone]) => Number(tone));
    expect(tones).toEqual(Array.from({ length: HEAP_CAP }, (_, place) => faceOf(place)));
    // All four are in a full heap, and most of it is as it was struck or only dulled: a heap of brass, not of brown.
    const share = FACES.map((_, tone) => tones.filter((one) => one === tone).length);
    for (const medals of share) expect(medals).toBeGreaterThan(0);
    expect(share[0]).toBe(Math.max(...share));
    expect(share[3]).toBeLessThan(HEAP_CAP / 4);
  });

  it('shows a place of the heap when its own medal lands, by the clock and not by the drawing', () => {
    const sheet = panelSheet();
    // Nothing in the sheet hides a medal of the heap or brings it out: a place is there or it is not, as the tray says.
    expect(sheet).not.toMatch(/data-fresh|mp-tray-appear/);
    expect(rulesFor(sheet, '.heap g')).toBe('');
    // A medal on its way is moved from where it sets off to where it lands, both of them its own.
    expect(sheet.match(/@keyframes mp-tray-in \{[\s\S]*?\n\}/)?.[0]).toMatch(/translate\(var\(--mp-dx\), var\(--mp-dy\)\)[\s\S]*translate\(0, 0\)/);
    expect(sheet.match(/@keyframes mp-tray-out \{[\s\S]*?\n\}/)?.[0]).toMatch(/translate\(0, 0\)[\s\S]*translate\(var\(--mp-dx\), var\(--mp-dy\)\)/);
    // The tray does not wait for the drawing to say a medal has landed (a medal that is not drawn never says so).
    const source = readFileSync(join(process.cwd(), 'src/components/game/MedalPusher/MedalTray.tsx'), 'utf8');
    expect(source).not.toMatch(/onAnimationEnd|animationend/);
    expect(source).toMatch(/if \(calm && air\.flights\.length > 0\) setAir\(trayStill\(air\)\)/);
  });

  it('is told what happened by the cabinet, each cause by its name, and is stilled when a machine is put up', () => {
    const cabinet = readFileSync(join(process.cwd(), 'src/components/game/MedalPusher/PlayTab.tsx'), 'utf8');
    for (const cause of ['won', 'bonus', 'refill']) expect(cabinet).toContain(`cause: '${cause}'`);
    expect(cabinet).toContain('tray.current?.still()');
    // The tray is given the purse to draw and nothing to compare it with.
    expect(cabinet).toContain('<MedalTray ref={tray} credits={hud.credits} onLand={landInTray} />');
    // The medals that came in are heard once: as they land in the tray where that is seen, and after the fall from
    // the front where it is not.
    expect(cabinet).toMatch(/if \(!tray\.current\?\.happened\(\{ purse: session\.credits, fed: fedNow, arrived \}\) && bonus \+ won > 0\) playSound\('win'/);
    expect(cabinet.match(/playSound\('win'/g)).toHaveLength(1);
    expect(cabinet.match(/playSound\('tray'/g)).toHaveLength(1);
  });
});

describe('the control panel as an object', () => {
  it('shows the medals on a counter of LED digits over a tray, and still says the number in type', () => {
    const html = render(<PlayTab />);
    const counter = html.split('data-testid="pusher-credits"')[0].split('<div').pop() + html.split('data-testid="pusher-credits"')[1].split('data-testid="pusher-feed-right"')[0];
    // The name and the number are type, as they were: a screen reader and a test read these.
    expect(html).toMatch(new RegExp(`<span[^>]*>MEDALS</span><strong[^>]*data-testid="pusher-credits"[^>]*>${START_CREDITS}</strong>`));
    // What is seen is the display after it, which shows the same number, and the tray under that.
    expect(shown(counter.split('data-testid="pusher-tray"')[0])).toBe(String(START_CREDITS));
    expect(counter.split('data-testid="pusher-tray"')[0].match(/<svg/g)).toHaveLength(COUNTER_PLACES);
    expect(counter).toContain(`data-heap="${Math.min(HEAP_CAP, START_CREDITS)}"`);
    expect(COUNTER_PLACES).toBeGreaterThanOrEqual(5);
  });

  it('shows the jackpot on a display too, after the figure in type that is counted up when one is paid', () => {
    const html = render(<PlayTab />);
    const plate = html.split('data-testid="pusher-jackpot"')[1].split('data-testid="pusher-wall"')[0];
    expect(plate.startsWith(`>${JACKPOT_START}</span>`) || plate.replace(/^[^>]*>/, '').startsWith(`${JACKPOT_START}</span>`)).toBe(true);
    // The display is the very next thing after the figure: it is the figure it follows.
    expect(plate).toMatch(/^[^>]*>\d+<\/span><span[^>]*><span[^>]*aria-hidden="true"/);
    expect(shown(plate.split('</span></span>')[0])).toBe(String(JACKPOT_START));
    expect(plate.split('</span></span>')[0].match(/<svg/g)).toHaveLength(JACKPOT_PLACES);
    expect(plate).toContain('data-tone="amber"');
  });

  it('keeps every control what it was: a button or a slider with its name, its state and its test id', () => {
    const html = render(<PlayTab />);
    // L and R are buttons with their names and keys; the caps are drawn by the sheet, not by more markup.
    for (const [id, name, key] of [
      ['pusher-feed-left', 'Feed the left rail', 'F'],
      ['pusher-feed-right', 'Feed the right rail', 'J'],
    ]) {
      expect(button(html, id)).toContain(`aria-label="${name}"`);
      expect(button(html, id)).toContain('type="button"');
      expect(button(html, id)).toContain('data-held="false"');
      expect(button(html, id)).toMatch(new RegExp(`<kbd[^>]*>${key}</kbd>`));
    }
    // The switches say whether they are on to whoever cannot see their lamps, and are named by their words alone:
    // the picture on a cap is hidden from a screen reader.
    for (const [id, name] of [
      ['pusher-auto', 'Auto'],
      ['pusher-sound', 'Sound'],
      ['pusher-sweep', 'Swing'],
    ]) {
      const html1 = button(html, id);
      expect(html1).toContain('aria-pressed="false"');
      expect(html1.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]+>/g, '').trim()).toBe(name);
      expect(html1).toMatch(/<svg[^>]*aria-hidden="true"/);
    }
    expect(button(html, 'pusher-sound-settings')).toContain('aria-expanded="false"');
    expect(button(html, 'pusher-sound-settings')).toContain('aria-label="Sound settings"');
    // No picture on the panel is a glyph that each device draws its own way.
    const controls = html.split('data-testid="pusher-controls"')[1].split('data-testid="pusher-keys"')[0];
    expect(controls).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
    // The sliders are sliders.
    expect(html.match(/<input[^>]*type="range"[^>]*data-testid="pusher-aim-(left|right)"/g)).toHaveLength(2);
  });

  it('prints a scale along each aim with a pip for every START pocket that rail can feed', () => {
    const html = render(<PlayTab />);
    const aims = html.split('data-testid="pusher-aim-left"')[1].split('data-testid="pusher-auto"')[0];
    const [left, right] = [aims.split('data-testid="pusher-aim-right"')[0], aims.split('data-testid="pusher-aim-right"')[1]];
    for (const side of [left, right]) {
      expect(side).toMatch(/<span[^>]*aria-hidden="true"[^>]*>(<i[^>]*style="--mp-at:[\d.]+"[^>]*><\/i>){2}<\/span>/);
      // The arrow that leads a swinging rail is not there until the rails swing.
      expect(side).not.toContain('pusher-lead');
    }
  });

  it('has a maker’s plate and the small print a panel carries, for the eye only, in both languages', () => {
    const en = render(<PlayTab />);
    expect(en).toMatch(/<span[^>]*aria-hidden="true"[^>]*data-testid="pusher-maker"[^>]*><b>GOLDEN FEVER<\/b><span>MODEL GF-777<\/span><\/span>/);
    expect(en).toMatch(/<p[^>]*aria-hidden="true"[^>]*data-testid="pusher-warning"[^>]*>MEDALS ONLY · DO NOT STRIKE OR ROCK THE MACHINE<\/p>/);
    const ja = render(<PlayTab />, 'ja');
    expect(ja).toContain('<span>型式 GF-777</span>');
    expect(ja).toMatch(/data-testid="pusher-warning"[^>]*>メダル専用　台をたたいたり、ゆらしたりしないでください<\/p>/);
    expect(ja).toMatch(/<span[^>]*>メダル<\/span><strong[^>]*data-testid="pusher-credits"/);
    // Each is a piece of its own.
    expect(render(<MakersPlate strings={getStrings('ja')} />)).toContain('型式 GF-777');
    expect(render(<PanelWarning strings={getStrings('en')} />)).toContain('MEDALS ONLY');
    for (const icon of [<AutoIcon key="a" />, <SpeakerIcon key="s" on />, <SpeakerIcon key="m" on={false} />]) expect(render(icon)).toMatch(/^<svg[^>]*aria-hidden="true"/);
    expect(render(<SpeakerIcon on />)).not.toBe(render(<SpeakerIcon on={false} />));
  });

  it('shows nothing of the device or of what the browser remembers in the first render', () => {
    vi.stubGlobal('window', {
      matchMedia: () => {
        throw new Error('the first render asks the device nothing');
      },
    });
    const html = render(<PlayTab />);
    expect(html).toContain('data-testid="pusher-tray"');
    expect(html).not.toMatch(/data-way=/);
  });
});

describe('the panel’s sheet', () => {
  const css = panelSheet();

  it('draws the parts by what they are, so that a switch or a slider added to the panel looks like the rest', () => {
    // Every switch: a button that is pressed or not, or that opens something. Every slider. The two feed buttons.
    expect(css).toMatch(/\.plate button\[aria-pressed\],\s*\.plate button\[aria-expanded\] \{/);
    expect(css).toMatch(/\.plate input\[type='range'\] \{/);
    expect(css).toMatch(/\.plate button\[data-arm\] \{/);
    // A switch that is not named gets a lamp all the same.
    expect(rulesFor(css, '.plate button[aria-pressed]')).toMatch(/--cap: #[0-9a-f]{6}/);
    // It names no class of the sound controls or of the switches of feel: it does not know them.
    expect(css).not.toMatch(/\.(soundPanel|soundMore|volume\w*|feel\w*|toggle)\b/);
  });

  it('says that a switch is on with light, and with the cap sitting lower, not with a fill alone', () => {
    const off = rulesFor(css, '.plate button[aria-pressed]::before');
    const on = rulesFor(css, ".plate button[aria-pressed='true']::before");
    expect(off).toContain('width: 26px');
    expect(off).toContain('height: 26px');
    expect(on).toMatch(/0 0 11px 2px/);
    expect(on).toContain('transform: translateY(1px)');
    expect(off).not.toMatch(/0 0 11px 2px/);
    // The button itself has no fill, on or off.
    expect(rulesFor(css, ".plate button[aria-pressed='true']")).toContain('background: none');
    expect(rulesFor(css, '.plate button[aria-pressed]')).toContain('background: none');
  });

  it('gives L and R a lamp that is lit while a medal can be fed, flares when pressed, and is out when none can', () => {
    const lit = rulesFor(css, '.plate button[data-arm]::before');
    const pressed = rulesFor(css, ".plate button[data-arm][data-held='true']:not(:disabled)::before");
    const out = rulesFor(css, '.plate button[data-arm]:disabled::before');
    expect(lit).toMatch(/0 0 14px rgba\(255, 201, 64/);
    // Pressed, the cap goes down three pixels and the shadow under it closes.
    expect(pressed).toContain('transform: translateY(3px)');
    expect(pressed).toMatch(/0 0 26px 7px rgba\(255, 222, 122/);
    expect(pressed).toContain('0 0 0 #5d3700');
    expect(out).not.toMatch(/rgba\(255, (201|222)/);
    // The bezel stays where it is: only the cap travels.
    expect(rulesFor(css, ".plate button[data-arm][data-held='true']:not(:disabled)")).toContain('transform: none');
  });

  it('changes how the controls look and nothing of how they answer a thumb', () => {
    expect(css).not.toMatch(/touch-action|user-select|-webkit-touch-callout/);
    // What it lays over a control takes no touch from it.
    for (const selector of ['.display', '.scale', '.warning']) expect(rulesFor(css, selector)).toContain('pointer-events: none');
    expect(rulesFor(css, '.plate button[data-arm]::after')).toContain('pointer-events: none');
    // A switch is as tall as its cap in its bezel, and no shorter: the strip that takes a thumb reaches past it.
    expect(rulesFor(css, '.plate button[aria-pressed]')).toContain('min-height: 34px');
    expect(rulesFor(css, '.plate button[aria-expanded]')).toContain('width: 44px');
  });

  it('keeps still where less motion is asked for, and never changes its lights faster than three times a second', () => {
    const chase = rulesFor(css, '.sign::before');
    // One turn a second in two steps: two changes a second.
    expect(chase).toContain('animation: mp-sign-chase 1s steps(1, end) infinite');
    expect(css.match(/@keyframes mp-sign-chase \{[\s\S]*?\n\}/)?.[0].match(/\d+% \{/g)).toHaveLength(3);
    const calm = css.split('@media (prefers-reduced-motion: reduce)').slice(1).join('\n');
    expect(calm).toMatch(/\.sign::before,\s*\.sign::after \{\s*animation: none;/);
    expect(calm).toMatch(/\.flight \{\s*display: none;/);
    expect(calm).toMatch(/transition: none/);
    // No animation of the sheet runs for ever but the sign's.
    expect(css.match(/infinite/g)).toHaveLength(1);
  });

  it('names the switches of a crowded row under their caps, so that what is beside them keeps its room', () => {
    // The row of sound settings: a fader and two switches on one line of a phone. Each switch is a small cap in the
    // middle of a button wide enough for a thumb, with its name under it, and the arcade's has a lamp of its own.
    const row = rulesFor(css, ".plate [data-testid='pusher-sound-panel'] > button[aria-pressed]");
    expect(row).toContain('flex-direction: column');
    expect(row).toContain('min-width: 46px');
    expect(rulesFor(css, ".plate [data-testid='pusher-sound-panel'] > button[aria-pressed]::before")).toMatch(/width: 22px;\s*height: 22px;/);
    expect(rulesFor(css, ".plate button[data-testid='pusher-arcade']")).toMatch(/--cap: #[0-9a-f]{6};\s*--cap-deep: #[0-9a-f]{6};/);
    // The fader in that row is as wide as its column and no wider, whatever the words over it would like: it does
    // not lie over the switch beside it.
    const cabinet = readFileSync(join(process.cwd(), 'src/components/game/MedalPusher/MedalPusher.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(rulesFor(cabinet, '.volume')).toContain('grid-template-columns: minmax(0, 1fr)');
    expect(rulesFor(cabinet, '.soundPanel')).toContain('grid-template-columns: minmax(0, 1fr) auto auto');
    // On its side the right hand's switches keep to one line, and where the column is too narrow for their names
    // beside their caps the names go under them there too. A second line there, over the open sound settings, is
    // more than a phone's screen is tall.
    const side = css.split('@media (orientation: landscape) {').slice(1).join('\n');
    expect(side).toMatch(/:fullscreen div\.switches \{[^}]*flex-wrap: nowrap;/);
    expect(side).toMatch(/@container \(max-width: 14rem\) \{\s*:fullscreen div\.switches > button:is\(\[aria-pressed\], \[aria-expanded\]\) \{[^}]*flex-direction: column;/);
  });

  it('has no foot when the cabinet fills the screen: the sticker under it is put away by its own sheet, and by no other rule', () => {
    expect(css).not.toContain('data-panel-foot');
    expect(css).not.toMatch(/sticker/);
    const plate = readFileSync(join(process.cwd(), 'src/components/game/MedalPusher/InstructionPlate.module.css'), 'utf8');
    expect(plate).toMatch(/:fullscreen:not\(:root\) \.sticker \{\s*display: none;/);
    // And the cabinet's own sheet says nothing of it either.
    const cabinet = readFileSync(join(process.cwd(), 'src/components/game/MedalPusher/MedalPusher.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(cabinet).not.toMatch(/sticker|data-panel-foot/);
  });

  it('hides the numbers in type only where the displays are seen', () => {
    expect(rulesFor(css, '.counter > strong')).toContain('color: transparent');
    const forced = css.split('@media (forced-colors: active)')[1] ?? '';
    expect(forced).toMatch(/\.display,\s*\.mirror \{\s*display: none;/);
    expect(forced).toContain('color: CanvasText');
    // The displays' digits fit: five for the medals, four for the jackpot.
    expect(segmentsFor(99999, COUNTER_PLACES).every((lit) => lit !== '')).toBe(true);
    expect(segmentsFor(9999, JACKPOT_PLACES).every((lit) => lit !== '')).toBe(true);
  });
});
