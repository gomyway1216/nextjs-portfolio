import type { CSSProperties } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, Coins, Heart, Swords } from 'lucide-react';
import { CatSprite } from './CatSprite';
import { ELEMENTS, MAX_LEVEL, ROLES, STAGES, type Character, type Language } from './data';
import { catStats, upgradeCost, type Save } from './engine';
import { GUIDE_URL, ROLE_DETAILS } from './guide';
import { partyElements, REACTIONS } from './elements';
import styles from './StarcatCaravan.module.css';

interface Props { save: Save; characters: readonly Character[]; language: Language }

export function CompanionCollection({ save, characters, language, ready, onAction }: Props & { ready: boolean; onAction: (action: { type: 'team' | 'upgrade'; id: string }) => void }) {
  const tx = (ja: string, en: string) => language === 'ja' ? ja : en;
  const owned = characters.filter((cat) => Object.hasOwn(save.owned, cat.id)).sort((a, b) => b.rarity - a.rarity);
  return <div className={styles.collectionGrid}>{owned.map((cat) => {
    const companion = save.owned[cat.id];
    const selected = save.team.includes(cat.id);
    const stats = catStats(cat.id, companion, characters);
    const color = { '--cat-accent': cat.accent, '--rarity': cat.rarity === 5 ? '#f2d584' : cat.rarity === 4 ? '#c0a4e9' : '#8ac6d0' } as CSSProperties;
    return <article key={cat.id} className={styles.catCard} style={color} data-testid={`cat-${cat.id}`}>
      <div className={styles.cardTop}><span className={styles.stars}>{'★'.repeat(cat.rarity)}</span><span style={{ color: ELEMENTS[cat.element].color }}>{ELEMENTS[cat.element].symbol} {ELEMENTS[cat.element].name[language]}</span></div>
      <div className={styles.portrait}><CatSprite cat={cat} />{selected && <span className={styles.inParty}><Check size={12} />{tx('編成中', 'In party')}</span>}</div>
      <p className={styles.catTitle}>{cat.title[language]}</p><div className={styles.catName}><h3>{cat.name[language]}</h3><span>Lv. {companion.level}</span></div>
      <p className={styles.role}>{ROLES[cat.role][language]} · {tx('出撃', 'Deploy')} {cat.cost}</p><p className={styles.roleHint}>{ROLE_DETAILS[cat.role].brief[language]}</p>
      <div className={styles.catStats}><span><Heart size={13} />{stats.hp}</span><span><Swords size={13} />{stats.attack}</span><span title={tx('重複1体につき能力+4%、最大+20%', '+4% stats per duplicate, up to +20%')}>✦ {Math.min(companion.copies - 1, 5)}/5</span></div>
      <div className={styles.cardActions}><button aria-pressed={selected} disabled={!ready || (!selected && save.team.length >= 4) || (selected && save.team.length <= 1)} onClick={() => onAction({ type: 'team', id: cat.id })}>{selected ? tx('外す', 'Remove') : tx('編成する', 'Add to party')}</button><button disabled={!ready || companion.level >= MAX_LEVEL || save.coins < upgradeCost(companion.level)} onClick={() => onAction({ type: 'upgrade', id: cat.id })}>{companion.level >= MAX_LEVEL ? 'MAX' : <>{tx('育成', 'Train')} <Coins size={12} />{upgradeCost(companion.level)}</>}</button></div>
    </article>;
  })}</div>;
}

export function PartyOverview({ save, characters, language }: Props) {
  const ja = language === 'ja';
  const team = save.team.flatMap((id) => { const cat = characters.find((entry) => entry.id === id); return cat && Object.hasOwn(save.owned, id) ? [cat] : []; });
  return <><ElementSynergy save={save} characters={characters} language={language} /><details className={styles.partyOverview}><summary>{ja ? '仲間の得意な動きと、出撃のしかた' : 'Companion traits and how to deploy'}</summary>
    <p>{ja ? '編成は「出撃できる仲間」の選択です。戦闘が始まったら、画面下の仲間を押してエネルギーを使い出撃させます。' : 'Your party selects who you can deploy. In battle, press a companion at the bottom to spend energy and send them out.'}</p>
    <ul>{team.map((cat) => <li key={cat.id}><strong>{cat.name[language]} <span>{ROLES[cat.role][language]}</span></strong><p>{ROLE_DETAILS[cat.role].tactic[language]}</p></li>)}</ul>
    <Link href={`${GUIDE_URL}#roles`}>{ja ? '編成・属性・敵を詳しく見る' : 'Read about roles, elements and enemies'}<ArrowRight size={14} /></Link>
  </details></>;
}

export function ElementSynergy({ save, characters, language }: Props) {
  const ja = language === 'ja';
  const selected = save.team.filter((id) => Object.hasOwn(save.owned, id));
  const { counts, resonances, reactions } = partyElements(selected, characters);
  return <aside className={styles.synergy} aria-label={ja ? 'この編成の属性連携' : 'Party element synergies'}>
    <h3>{ja ? '属性でつながる、自由な編成' : 'Build around your favorite elements'}</h3>
    <p>{ja ? '4役の必須枠はありません。好きな仲間を1〜4体。属性を混ぜて連携、重ねて共鳴を狙えます。' : 'No required role slots. Choose any 1–4 companions: mix elements for reactions or match them for resonance.'}</p>
    <div className={styles.elementChips}>{(Object.keys(counts) as (keyof typeof counts)[]).filter((element) => counts[element] > 0).map((element) => <span key={element} style={{ color: ELEMENTS[element].color }}>{ELEMENTS[element].symbol} {ELEMENTS[element].name[language]} ×{counts[element]}</span>)}</div>
    <ul>{resonances.map((element) => <li key={element}><strong>{ELEMENTS[element].name[language]}{ja ? 'の共鳴' : ' resonance'}</strong><span>{ja ? 'この属性の出撃HP +20%・攻撃/回復力 +15%' : 'This element: +20% deployed HP, +15% attack/healing'}</span></li>)}{reactions.map((id) => <li key={id}><strong style={{ color: REACTIONS[id].color }}>{REACTIONS[id].name[language]}</strong><span>{REACTIONS[id].detail[language]}</span></li>)}</ul>
    {reactions.length > 0 && <p>{ja ? '同じ敵へ4秒以内に異なる属性で攻撃すると連携。同じ敵では2秒の再発動待ちがあります。' : 'Hit the same enemy with different elements within 4 seconds to react. Each enemy has a 2-second reaction cooldown.'}</p>}
    {resonances.length === 0 && reactions.length === 0 && <p>{ja ? '1体だけでも出撃できます。別の仲間を加えると属性の組み合わせが増えます。' : 'A solo companion can still deploy. Add another companion to unlock more element combinations.'}</p>}
    <Link href={`${GUIDE_URL}#elements`}>{ja ? '属性の組み合わせを見る' : 'Explore element combinations'}<ArrowRight size={14} /></Link>
  </aside>;
}

export function TravelRecord({ save, language }: Pick<Props, 'save' | 'language'>) {
  const ja = language === 'ja';
  return <aside className={styles.travelRecord} aria-label={ja ? '保存される旅の記録' : 'Saved adventure record'}>
    <div><h3>{ja ? '旅の記録' : 'Travel journal'}</h3><p>{ja ? '勝敗が確定した時点の結果を保存します。' : 'Results are recorded when a battle finishes.'}</p></div>
    <dl><div><dt>{ja ? '島のクリア' : 'Islands cleared'}</dt><dd>{save.cleared.length} / {STAGES.length}</dd></div><div><dt>{ja ? '勝利 / 敗北' : 'Wins / losses'}</dt><dd>{save.wins} / {save.losses}</dd></div><div><dt>{ja ? '召喚回数' : 'Wishes made'}</dt><dd>{save.pulls}</dd></div></dl>
    <Link href={`${GUIDE_URL}#saving`}>{ja ? '途中結果・実績と保存の範囲' : 'What progress and achievements are saved'}<ArrowRight size={14} /></Link>
  </aside>;
}
