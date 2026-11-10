import { ELEMENTS, STAGES, type Character, type Language } from './data';
import type { Save } from './engine';
import { adventureOf } from './adventure';
import { battleBriefing, type Foe } from './briefing';
import styles from './FortressBriefing.module.css';

const BENCH_NAMES = 3;

/** What the current island's fortress holds, against the party as it would enter right now. */
export function FortressBriefing({ save, characters, language }: { save: Save; characters: readonly Character[]; language: Language }) {
  const brief = battleBriefing(save, adventureOf(save).region, characters);
  if (!brief) return null;
  const tx = (ja: string, en: string) => language === 'ja' ? ja : en;
  const name = (id: string) => characters.find((cat) => cat.id === id)!.name[language];
  const element = ELEMENTS[brief.element];
  const more = brief.bench.length - BENCH_NAMES;
  const row = (label: string, foe: Foe) => <tr>
    <th scope="row">{label}</th><td>{foe.hp}</td><td>{foe.hit}</td>
    <td>{foe.burst}<em data-defeats={foe.burst >= foe.hp}>{foe.burst >= foe.hp ? tx('撃破', 'defeats') : tx('耐える', 'survives')}</em></td>
  </tr>;
  return <aside className={styles.briefing} aria-label={tx('この島の砦の偵察メモ', 'Briefing for this island’s fortress')} data-testid="starcat-briefing">
    <div className={styles.head}>
      <div><p className={styles.eyebrow}>{tx('砦の偵察メモ', 'FORTRESS BRIEFING')}</p><h3>{brief.stage + 1}. {STAGES[brief.stage].name[language]}</h3></div>
      <p><span style={{ color: element.color }}>{element.symbol} {tx(`${element.name.ja}属性の影`, `${element.name.en} shadows`)}</span> · {tx(`敵${brief.enemies}体（最後の1体はボス）`, `${brief.enemies} enemies (the last is the boss)`)} · {save.cleared.includes(brief.stage) ? tx('攻略済み', 'Cleared') : tx('未攻略', 'Not cleared yet')}</p>
    </div>
    <dl className={styles.stats}>
      <div><dt>{tx('パーティーHP', 'Party HP')}</dt><dd>{brief.hp}</dd></div>
      <div><dt>{tx('攻撃力の合計', 'Combined attack')}</dt><dd>{brief.attack}</dd></div>
      <div><dt>{tx('防御力（平均）', 'Defense (average)')}</dt><dd>{brief.defense}</dd></div>
    </dl>
    <ul className={styles.party} aria-label={tx('編成中の仲間と属性の相性', 'Party members and their element matchup')}>
      {[0, 1, 2, 3].map((index) => {
        const member = brief.party[index];
        if (!member) return <li key={index} data-empty="true">{tx('空き', 'Empty slot')}</li>;
        return <li key={index} data-edge={member.edge}><span>{name(member.id)}</span><b>{member.edge ? tx('有利 ×1.5', 'Strong ×1.5') : tx('等倍 ×1', 'Even ×1')}</b></li>;
      })}
    </ul>
    <p className={styles.bench}><span>{tx('控えで有利な仲間', 'Strong companions outside the party')}</span><b>{brief.bench.length ? `${brief.bench.slice(0, BENCH_NAMES).map(name).join(tx('・', ', '))}${more > 0 ? tx(` ほか${more}体`, ` +${more} more`) : ''}` : tx('いません', 'None')}</b></p>
    <table className={styles.foes}>
      <caption>{tx('この編成で挑んだときの数値', 'Numbers for this party')}</caption>
      <thead><tr><td /><th scope="col">HP</th><th scope="col">{tx('被弾1回', 'One hit taken')}</th><th scope="col">{tx('星の絆1回', 'One Star bond')}</th></tr></thead>
      <tbody>{row(tx('影', 'Shadow'), brief.shadow)}{row(tx('影の守り手', 'Shadow guardian'), brief.guardian)}</tbody>
    </table>
    <small>{tx('相性の×1.5は仲間の通常攻撃だけに掛かります。被弾は結界が受け止める前の値、星の絆は敵の防御で軽減した値です。「撃破」はHPが満タンの敵も1回で倒せる、「耐える」は満タンなら倒しきれないという意味です。', 'The ×1.5 matchup applies to companions’ normal attacks only. A hit taken is shown before any ward absorbs it; Star bond is shown after enemy defense. “Defeats” means one cast is enough even at full HP; “survives” means a full-HP enemy is left standing.')}</small>
  </aside>;
}
