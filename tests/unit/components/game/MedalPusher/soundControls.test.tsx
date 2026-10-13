import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it } from 'vitest';

import { PlayTab } from '@/components/game/MedalPusher/PlayTab';
import { SoundSettingsButton, SoundSettingsPanel, useSoundSettings, type SoundControl } from '@/components/game/MedalPusher/SoundControls';
import { getStrings } from '@/components/game/MedalPusher/i18n';
import { VOLUME_PERCENT, type SoundSettings } from '@/components/game/MedalPusher/soundSettings';
import { createI18nInstance } from '@/lib/i18n';

const render = (node: React.ReactNode, lang: 'en' | 'ja' = 'en') =>
  renderToStaticMarkup(<I18nextProvider i18n={createI18nInstance(lang)}>{node}</I18nextProvider>);

/** The settings as the cabinet would hand them to the button and the row, with nothing behind them. */
const control = (settings: SoundSettings, open = true): SoundControl => ({
  settings,
  change: () => undefined,
  open,
  toggle: () => undefined,
  close: () => undefined,
  buttonId: 'sound-button',
  panelId: 'sound-row',
});

/** The opening tag of whatever has this test id. */
const tagOf = (html: string, id: string): string => html.match(new RegExp(`<[a-z]+[^>]*data-testid="${id}"[^>]*>`))?.[0] ?? '';

describe('the sound settings as the server renders the cabinet', () => {
  const html = render(<PlayTab />);

  it('puts a button for them beside Sound, closed, with a name', () => {
    const button = tagOf(html, 'pusher-sound-settings');
    expect(button).toContain('type="button"');
    expect(button).toContain('aria-expanded="false"');
    expect(button).toContain('aria-label="Sound settings"');
    expect(button).toContain('title="Sound settings"');
    // Closed, there is no row for it to point at.
    expect(button).not.toContain('aria-controls');
    // It comes straight after Sound and Auto, in the same row of switches.
    const [auto, sound, settings] = ['pusher-auto', 'pusher-sound', 'pusher-sound-settings'].map((id) => html.indexOf(`data-testid="${id}"`));
    expect(auto).toBeGreaterThan(0);
    expect(sound).toBeGreaterThan(auto);
    expect(settings).toBeGreaterThan(sound);
    expect(html.slice(sound, settings)).not.toContain('</div>');
    // The picture on it is drawn, in the button's own colour, and is not read out.
    const picture = html.slice(settings).match(/<svg[^>]*>/)?.[0] ?? '';
    expect(picture).toContain('aria-hidden="true"');
    expect(html.slice(settings, settings + 900)).toContain('currentColor');
  });

  it('shows no row until it is asked for, and Sound itself is off as it always was', () => {
    expect(html).not.toContain('data-testid="pusher-sound-panel"');
    expect(html).not.toContain('data-testid="pusher-volume"');
    expect(html).not.toContain('data-testid="pusher-music"');
    expect(tagOf(html, 'pusher-sound')).toContain('aria-pressed="false"');
  });

  it('starts from the usual settings, whatever a device may remember: the browser renders the same first', () => {
    const Probe = () => {
      const { settings, open } = useSoundSettings();
      return <output>{JSON.stringify({ settings, open })}</output>;
    };
    expect(render(<Probe />)).toContain(JSON.stringify({ settings: { volume: 100, music: true }, open: false }).replace(/"/g, '&quot;'));
  });
});

describe('the row of sound settings', () => {
  const en = getStrings('en');
  const ja = getStrings('ja');

  it('is a named group that its button points at', () => {
    const settings = { volume: 100, music: true };
    const row = render(<SoundSettingsPanel control={control(settings)} strings={en} />);
    const group = tagOf(row, 'pusher-sound-panel');
    expect(group).toContain('role="group"');
    expect(group).toContain('aria-label="Sound settings"');
    expect(group).toContain('id="sound-row"');
    const button = tagOf(render(<SoundSettingsButton control={control(settings)} strings={en} />), 'pusher-sound-settings');
    expect(button).toContain('aria-expanded="true"');
    expect(button).toContain('aria-controls="sound-row"');
    expect(button).toContain('id="sound-button"');
    // Closed, it renders nothing at all.
    expect(render(<SoundSettingsPanel control={control(settings, false)} strings={en} />)).toBe('');
  });

  it('has a slider for the volume, labelled, from silent to twice the usual in steps, with the usual in its middle', () => {
    const row = render(<SoundSettingsPanel control={control({ volume: 100, music: true })} strings={en} />);
    const slider = tagOf(row, 'pusher-volume');
    expect(slider).toContain('type="range"');
    expect(slider).toContain(`min="${VOLUME_PERCENT.min}"`);
    expect(slider).toContain(`max="${VOLUME_PERCENT.max}"`);
    expect(slider).toContain(`step="${VOLUME_PERCENT.step}"`);
    expect(slider).toContain('value="100"');
    expect(slider).toContain('aria-valuetext="100%, the usual level"');
    // Its label is the word Volume, tied to it; the figure beside the word is for the eye and is not read twice.
    const id = slider.match(/ id="([^"]+)"/)?.[1] ?? '';
    expect(id).not.toBe('');
    expect(row).toMatch(new RegExp(`<label[^>]*for="${id}"[^>]*>Volume<span[^>]*aria-hidden="true"`));
    expect(tagOf(row, 'pusher-volume-value')).toContain('aria-hidden="true"');
    expect(row.replace(/<[^>]+>/g, ' ')).toMatch(/Volume\s+100%\s+usual/);
  });

  it.each([
    [0, '0%, silent', '0%（無音）', 'silent', '無音'],
    [5, '5%', '5%', '', ''],
    [95, '95%', '95%', '', ''],
    [100, '100%, the usual level', '100%（標準）', 'usual', '標準'],
    [130, '130%', '130%', '', ''],
    [200, '200%', '200%', '', ''],
  ])('reads a volume of %i out as "%s" and "%s"', (volume, english, japanese, mark, markJa) => {
    const rowEn = render(<SoundSettingsPanel control={control({ volume, music: true })} strings={en} />);
    const rowJa = render(<SoundSettingsPanel control={control({ volume, music: true })} strings={ja} />, 'ja');
    expect(tagOf(rowEn, 'pusher-volume')).toContain(`value="${volume}"`);
    expect(tagOf(rowEn, 'pusher-volume')).toContain(`aria-valuetext="${english}"`);
    expect(tagOf(rowJa, 'pusher-volume')).toContain(`aria-valuetext="${japanese}"`);
    expect(en.volumeValue(volume)).toBe(english);
    expect(ja.volumeValue(volume)).toBe(japanese);
    expect(en.volumeMark(volume)).toBe(mark);
    expect(ja.volumeMark(volume)).toBe(markJa);
    // What is shown is the figure, and the mark where there is one.
    const shown = (row: string) => row.slice(row.indexOf('data-testid="pusher-volume-value"')).replace(/^[^>]*>/, '').split('</label>')[0].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    expect(shown(rowEn)).toBe(mark ? `${volume}% ${mark}` : `${volume}%`);
    expect(shown(rowJa)).toBe(markJa ? `${volume}% ${markJa}` : `${volume}%`);
  });

  it('has a switch for the loop alone, which says which way it is', () => {
    const on = render(<SoundSettingsPanel control={control({ volume: 100, music: true })} strings={en} />);
    const off = render(<SoundSettingsPanel control={control({ volume: 100, music: false })} strings={en} />);
    expect(tagOf(on, 'pusher-music')).toContain('aria-pressed="true"');
    expect(tagOf(off, 'pusher-music')).toContain('aria-pressed="false"');
    expect(tagOf(on, 'pusher-music')).toContain('type="button"');
    expect(on).toMatch(/<span aria-hidden="true">♪<\/span>\s*Music<\/button>/);
  });

  it('reads in Japanese', () => {
    const row = render(<SoundSettingsPanel control={control({ volume: 100, music: true })} strings={ja} />, 'ja');
    expect(tagOf(row, 'pusher-sound-panel')).toContain('aria-label="音の設定"');
    expect(row).toMatch(/<label[^>]*>音量</);
    expect(row).toMatch(/♪<\/span>\s*BGM<\/button>/);
    const button = tagOf(render(<SoundSettingsButton control={control({ volume: 100, music: true }, false)} strings={ja} />, 'ja'), 'pusher-sound-settings');
    expect(button).toContain('aria-label="音の設定"');
    expect(button).toContain('aria-expanded="false"');
  });
});
