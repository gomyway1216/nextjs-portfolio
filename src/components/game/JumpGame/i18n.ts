/**
 * Local bilingual copy for the Jump Game pause feature. Kept inside the
 * component dir so it does not touch the shared translation constants.
 */

import type { GameLanguage } from '../constants/gameTranslations';

export interface JumpGamePauseCopy {
  pause: string;
  resume: string;
  pausedTitle: string;
  pausedHint: (seconds: number) => string;
  resumingIn: (seconds: number) => string;
  helpTitle: string;
  help: (seconds: number) => string;
}

const copy: Record<GameLanguage, JumpGamePauseCopy> = {
  en: {
    pause: 'Pause',
    resume: 'Resume',
    pausedTitle: 'Paused',
    pausedHint: (seconds) =>
      `Press P or Esc, or tap Resume. Play continues after a ${seconds}-second countdown.`,
    resumingIn: (seconds) => `Resuming in ${seconds}`,
    helpTitle: 'Pause',
    help: (seconds) =>
      `Press P or Esc, or use the Pause button, to freeze the run. It also pauses by itself when the tab is hidden, the window loses focus, or you open this guide. Resuming starts a ${seconds}-second countdown.`,
  },
  ja: {
    pause: '一時停止',
    resume: '再開',
    pausedTitle: '一時停止中',
    pausedHint: (seconds) =>
      `P か Esc キー、または「再開」で続きから。${seconds}秒のカウントダウン後に動き出します。`,
    resumingIn: (seconds) => `再開まであと${seconds}秒`,
    helpTitle: '一時停止',
    help: (seconds) =>
      `P か Esc キー、または「一時停止」ボタンでプレイを止められます。タブが隠れたとき、ウィンドウがフォーカスを失ったとき、この遊び方を開いたときも自動で止まります。再開すると${seconds}秒のカウントダウンが始まります。`,
  },
};

export const getJumpGamePauseCopy = (language: GameLanguage): JumpGamePauseCopy => copy[language];
