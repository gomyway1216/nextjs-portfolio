/** Persisted emoji identifiers remain compatible with existing guest sessions and game histories. */
export const CHARACTERS = [
  { avatar: '🐱', id: 'cat', name: 'ももねこ' },
  { avatar: '🐶', id: 'dog', name: 'ぽていぬ' },
  { avatar: '🐼', id: 'panda', name: 'ぱんだん' },
  { avatar: '🦊', id: 'fox', name: 'こんころ' },
  { avatar: '🐸', id: 'frog', name: 'けろまる' },
  { avatar: '🐙', id: 'octopus', name: 'たこぽん' },
  { avatar: '🦄', id: 'unicorn', name: 'ゆめユニ' },
  { avatar: '🐧', id: 'penguin', name: 'ぺんた' },
  { avatar: '🎃', id: 'pumpkin', name: 'かぼまる' },
  { avatar: '👻', id: 'ghost', name: 'おばもち' },
  { avatar: '🦇', id: 'bat', name: 'こもり' },
  { avatar: '🧙', id: 'witch', name: 'まじょこ' },
  { avatar: 'rabbit', id: 'rabbit', name: 'うさぽん' },
  { avatar: 'capybara', id: 'capybara', name: 'かぴまる' },
  { avatar: 'axolotl', id: 'axolotl', name: 'うぱもち' },
  { avatar: 'hedgehog', id: 'hedgehog', name: 'はりころ' },
  { avatar: 'redpanda', id: 'redpanda', name: 'れっさ' },
  { avatar: 'sloth', id: 'sloth', name: 'のんびり' },
  { avatar: 'alien', id: 'alien', name: 'そらまめ' },
  { avatar: 'pudding', id: 'pudding', name: 'ぷりんす' },
] as const;
export function characterFor(avatar: string) {
  return CHARACTERS.find((character) => character.avatar === avatar) ?? CHARACTERS[0];
}
