'use client';

import Link from 'next/link';
import { ArrowLeft, ArrowRight, Compass, Heart, Shield, Sparkles, Swords, WandSparkles } from 'lucide-react';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { ShadowSprite } from './CatSprite';
import { ELEMENTS, MAX_LEVEL, PITY_FIVE, PITY_FOUR, ROLES, STAGES, SUMMON_COST, type Language, type Role } from './data';
import { ROLE_DETAILS } from './guide';
import { AURA_SECONDS, REACTION_COOLDOWN, REACTIONS, type Reaction } from './elements';
import styles from './StarcatGuide.module.css';

const roleIcons = { guard: Shield, fighter: Swords, ranger: Sparkles, healer: Heart };

export function GuideContent({ language }: { language: Language }) {
  const ja = language === 'ja';
  const tx = (a: string, b: string) => ja ? a : b;
  const anchors = [['journey', tx('冒険の流れ', 'The journey')], ['roles', tx('仲間の得意技', 'Companion traits')], ['elements', tx('属性で自由に編成', 'Element combinations')], ['enemies', tx('敵と属性', 'Enemies & elements')], ['growth', tx('召喚と育成', 'Wishes & training')], ['saving', tx('途中結果・実績・保存', 'Progress & saving')]];
  return <main className={styles.page}><div className={styles.shell}>
    <Link className={styles.back} href="/games/starcat-caravan"><ArrowLeft size={16} />{tx('ゲームに戻る', 'Back to the game')}</Link>
    <header className={styles.hero}><p className={styles.eyebrow}>STARCAT CARAVAN · FIELD GUIDE</p><h1>{tx('猫たちとの旅を、ここから。', 'Your adventure starts here.')}</h1><p>{tx('仲間を集め、育て、出撃させる。空に浮かぶ6つの島を、影の砦から取り戻す冒険です。', 'Collect, train and deploy your companions. Reclaim six floating islands from the shadow fortresses.')}</p><Link href="/games/starcat-caravan">{tx('冒険を始める', 'Begin your adventure')}<ArrowRight size={16} /></Link></header>
    <nav className={styles.toc} aria-label={tx('ガイドの目次', 'Guide contents')}>{anchors.map(([id, label]) => <a href={`#${id}`} key={id}>{label}</a>)}</nav>

    <section id="journey" className={styles.section}><div className={styles.sectionTitle}><Compass /><h2>{tx('島を取り戻すまで', 'Reclaiming an island')}</h2></div>
      <ol className={styles.steps}>
        <li><b>01</b><h3>{tx('仲間を編成', 'Choose your party')}</h3><p>{tx('獲得済みの仲間から1〜4体を選びます。編成しただけでは戦場には出ません。', 'Choose 1–4 acquired companions. Selecting a party does not deploy them automatically.')}</p></li>
        <li><b>02</b><h3>{tx('島を選び、出撃', 'Choose an island')}</h3><p>{tx('最初は「はじまりの草原」。初回クリアで次の島が開き、全6島の攻略が目標です。', 'Begin at Firstlight Meadow. A first clear unlocks the next island; reclaim all six to finish the campaign.')}</p></li>
        <li><b>03</b><h3>{tx('エネルギーで仲間を出す', 'Spend energy to deploy')}</h3><p>{tx('戦闘画面の下にある仲間を押して出撃。エネルギーは毎秒14回復し、最大200。同じ仲間も再出撃できます。', 'Press a companion at the bottom of the battlefield. Energy regenerates by 14 per second, up to 200. You can deploy the same companion again.')}</p></li>
        <li><b>04</b><h3>{tx('3分以内に敵の砦を破壊', 'Break the fortress in 3 minutes')}</h3><p>{tx('仲間は自動で前進・攻撃。自拠点のHPが0、または時間切れで敗北です。勝利時の報酬と結果は、その場で進行に反映します。', 'Companions move and attack automatically. Lose if your base reaches zero HP or time expires. Victory rewards and results are added immediately.')}</p></li>
      </ol>
      <aside className={styles.tip}><WandSparkles size={20} /><p>{tx('星の砲撃は敵全体に140ダメージ。20秒で再充填します。ボスや敵が重なった場面で使うと突破を助けます。戦場に出せる味方は最大16体です。', 'Star cannon deals 140 damage to every enemy and recharges in 20 seconds. Use it against the boss or clustered enemies. Up to 16 allies can be on the battlefield.')}</p></aside>
    </section>

    <section id="roles" className={styles.section}><div className={styles.sectionTitle}><Shield /><h2>{tx('役は必須枠ではなく、得意な動き。', 'Traits, not required party slots')}</h2></div><p>{tx('好きな仲間を1〜4体選べます。盾役・近接・遠距離・回復を1体ずつ揃える必要はありません。役は各キャラの動きの目安。戦い方は属性連携や共鳴でも作れます。', 'Choose any 1–4 companions. You do not need one guardian, fighter, ranger and healer. Roles describe how companions act; reactions and resonance give you other ways to build a party.')}</p>
      <div className={styles.roles}>{(Object.keys(ROLES) as Role[]).map((role) => { const Icon = roleIcons[role]; return <article key={role}><Icon size={24} /><h3>{ROLES[role][language]}</h3><strong>{ROLE_DETAILS[role].brief[language]}</strong><p>{ROLE_DETAILS[role].tactic[language]}</p></article>; })}</div>
      <aside className={styles.tip}><p>{tx('水＋風なら回復役がいなくても連携で回復できます。火を重ねて攻撃を強めたり、3属性を混ぜて敵に応じて出す仲間を変えたり。レベル・出撃コスト・射程を見ながら、自分の編成を試しましょう。', 'Water + Wind can heal through reactions without a healer. Stack Fire for stronger attacks, or mix three elements and deploy for the enemy ahead. Experiment with levels, deployment costs and reach.')}</p></aside>
    </section>

    <section id="elements" className={styles.section}><div className={styles.sectionTitle}><Sparkles /><h2>{tx('混ぜて連携、重ねて共鳴。', 'Mix to react. Match to resonate.')}</h2></div>
      <p>{tx(`味方が攻撃すると、敵へ${AURA_SECONDS}秒間その属性を付けます。その間に別属性の味方が同じ敵を攻撃すると連携。順番はどちらからでも同じです。敵自身の属性だけでは発動せず、同じ敵には${REACTION_COOLDOWN}秒の再発動待ちがあります。`, `An ally hit applies its element to the enemy for ${AURA_SECONDS} seconds. Another element hitting that enemy triggers a reaction, in either order. The enemy's native element alone does not trigger one. Each enemy has a ${REACTION_COOLDOWN}-second cooldown.`)}</p>
      <div className={styles.reactions}>{(Object.keys(REACTIONS) as Reaction[]).map((id) => { const reaction = REACTIONS[id]; return <article key={id}><p style={{ color: reaction.color }}>{reaction.elements.map((element) => `${ELEMENTS[element].symbol} ${ELEMENTS[element].name[language]}`).join(' ＋ ')}</p><h3>{reaction.name[language]}</h3><p>{reaction.detail[language]}</p></article>; })}</div>
      <p>{tx('連携の追加効果は、発動した仲間の攻撃力を基準にします。回復役の通常攻撃では半分が基準。有利属性の1.5倍とは別に加わり、連携の追加ダメージから次の連携は発生しません。恵みの風は倒れた仲間を復活させません。', 'Reaction effects use the triggering companion’s attack power (half for a healer’s normal attack). They are added separately from the 1.5× element advantage and do not chain into more reactions. Restoring breeze does not revive defeated allies.')}</p>
      <div className={styles.twoColumns}><article><h3>{tx('同じ属性を2体以上：属性共鳴', '2+ companions of one element: resonance')}</h3><p>{tx('編成に同属性の異なる仲間を2体以上入れると、その属性の仲間は出撃時HP+20%・攻撃/回復力+15%。3体・4体でも倍率は同じです。同じ仲間を何度出撃させても共鳴の人数は増えません。', 'Select at least two distinct companions of one element to give that element +20% deployed HP and +15% attack/healing. Three or four do not increase the bonus. Redeploying one companion does not count as another party member.')}</p></article><article><h3>{tx('どちらの編成も試せる', 'Both approaches are welcome')}</h3><p>{tx('同属性で揃えれば共鳴で底上げ。複数属性なら追加ダメージ・範囲攻撃・回復を使い分けられます。火2・水1・風1なら、火の共鳴と3種類の連携を両立できます。必須の職業枠や属性枠はありません。', 'Match elements for stronger base stats, or mix them for extra damage, area attacks and healing. Two Fire, one Water and one Wind provide Fire resonance and all three reactions. No role or element slot is mandatory.')}</p></article></div>
    </section>

    <section id="enemies" className={styles.section}><div className={styles.sectionTitle}><Swords /><h2>{tx('相手は、影の兵士とボス', 'Shadow soldiers and bosses')}</h2></div><p>{tx('現在の敵は通常兵と、各島の最後に出現するボスの2種類です。ボスはHP・攻撃・射程が大きく、通常兵よりゆっくり進みます。島ごとに敵の属性と強さ、出現する数・間隔が変わります。', 'There are currently two enemy types: regular soldiers and the boss that spawns last on each island. Bosses have more HP, damage and reach, and move more slowly. Islands change enemy element, strength, number and spawn interval.')}</p>
      <div className={styles.enemies}><div><ShadowSprite /><strong>{tx('影の兵士', 'Shadow soldier')}</strong><p>{tx('砦から順番に出現する通常兵。', 'Regular enemies emerge from the fortress.')}</p></div><div><ShadowSprite boss /><strong>{tx('最後の影（ボス）', 'The final shadow (boss)')}</strong><p>{tx('最後に1体出現する強敵。', 'One powerful enemy spawns last.')}</p></div></div>
      <div className={styles.elements}><span>✹ {tx('火 → 風', 'Fire → Wind')}</span><span>❧ {tx('風 → 水', 'Wind → Water')}</span><span>◈ {tx('水 → 火', 'Water → Fire')}</span><b>{tx('有利な相手へ1.5倍ダメージ', '1.5× damage with an element advantage')}</b></div>
      <div className={styles.tableScroll}><table><caption>{tx('島ごとの敵と初回報酬', 'Islands, enemies and first-clear rewards')}</caption><thead><tr><th>{tx('島', 'Island')}</th><th>{tx('敵の属性', 'Element')}</th><th>{tx('敵数', 'Enemies')}</th><th>{tx('星のしずく / コイン', 'Stardrops / Coins')}</th></tr></thead><tbody>{STAGES.map((stage, i) => <tr key={i}><th>{i + 1}. {stage.name[language]}</th><td>{ELEMENTS[stage.element].name[language]}</td><td>{stage.enemies} {tx('体（ボス含む）', '(including boss)')}</td><td>{stage.gems} / {stage.coins}</td></tr>)}</tbody></table></div>
      <p>{tx('クリア済みの島も周回できます。再クリアの報酬は星のしずく80個と、島に応じたコインです。敗北しても所持通貨は減りません。', 'Replay cleared islands for 80 Stardrops and coins based on the island. Defeat does not remove your currency.')}</p>
    </section>

    <section id="growth" className={styles.section}><div className={styles.sectionTitle}><Sparkles /><h2>{tx('出会いを、冒険の力に', 'Turn meetings into strength')}</h2></div>
      <div className={styles.twoColumns}><article><h3>{tx('星を弾いて召喚', 'Flick a star to wish')}</h3><p>{tx(`星のしずく${SUMMON_COST}個で1回。星を下へ引いて離すか、上へ素早く弾くと召喚します。タップだけでは発射しません。引いた星を元に戻すとキャンセル。Enter / Spaceでも操作できます。`, `One wish costs ${SUMMON_COST} Stardrops. Pull the star down and release, or flick upward quickly. A tap does not launch. Return a drawn star to its origin to cancel. Enter / Space also works.`)}</p><p>{tx(`通常確率は★5が3%、★4が15%、★3が82%。同じレア度の仲間は均等確率。★4以上は${PITY_FOUR}回以内、★5は${PITY_FIVE}回以内に確定し、確定カウントも保存されます。`, `Base rates are ★5 3%, ★4 15%, ★3 82%, with equal chances within a rarity. A ★4+ is guaranteed within ${PITY_FOUR} wishes and a ★5 within ${PITY_FIVE}. Guarantee counters are saved.`)}</p><p>{tx('獲得と通貨消費は発射時に一度だけ確定。演出をスキップしたり閉じたりしても、獲得した仲間は残ります。', 'Awards and spending are committed once at launch. Skipping or closing the reveal keeps every acquired companion.')}</p></article>
      <article><h3>{tx('育成と重複のしくみ', 'Training and duplicates')}</h3><p>{tx(`仲間一覧には獲得済みだけを表示します。コインでLv.${MAX_LEVEL}まで育成。HPと攻撃・回復力が上がります。`, `Only acquired companions appear in your collection. Use coins to train up to Lv.${MAX_LEVEL}, improving HP and attack/healing power.`)}</p><p>{tx('重複した仲間はレベルを維持し、1体ごとに能力を4%強化（最大20%）。さらに★3で80、★4で160、★5で320コインを獲得します。', 'Duplicates keep the current level and grant +4% stats each, up to +20%, plus 80/160/320 coins for ★3/★4/★5.')}</p><p>{tx('レア度が高くても出撃エネルギーや再出撃時間が必要です。低コストの仲間を混ぜると、前線を維持しやすくなります。', 'High-rarity companions still need energy and a redeploy cooldown. Lower-cost companions can help keep the frontline supplied.')}</p></article></div>
    </section>

    <section id="saving" className={styles.section}><div className={styles.sectionTitle}><Heart /><h2>{tx('途中結果・実績は、どこまで残る？', 'Which progress and achievements are kept?')}</h2></div>
      <p>{tx('「旅の記録」に島の攻略数・勝敗合計・召喚回数を表示します。これらは既存のセーブデータに含まれ、ログイン中はアカウントに保存されます。専用の実績バッジ・称号・達成日時を保存する機能は、現在まだありません。', 'The travel journal shows cleared islands, total wins/losses and wish count. These are part of your save and sync to your account when signed in. Dedicated achievement badges, titles and unlock timestamps are not currently implemented.')}</p>
      <div className={styles.saveGrid}><article><h3>{tx('保存するもの', 'Saved')}</h3><ul><li>{tx('所持キャラ・重複数・レベル・編成', 'Owned companions, copies, levels and party')}</li><li>{tx('星のしずく・コイン・召喚回数・天井', 'Stardrops, coins, wish count and guarantees')}</li><li>{tx('クリアした島と、次の島の解放', 'Cleared islands and access to the next island')}</li><li>{tx('決着した戦闘の勝利・敗北の合計', 'Total wins and losses from completed battles')}</li></ul></article><article><h3>{tx('保存しないもの', 'Not saved')}</h3><ul><li>{tx('戦闘途中のHP・敵の位置・残り時間', 'In-battle HP, enemy positions and remaining time')}</li><li>{tx('未決着で撤退・終了した戦闘の勝敗', 'A win/loss for an abandoned, unfinished battle')}</li><li>{tx('1戦ごとの詳細履歴・実績の達成日時', 'Per-battle detailed history and achievement timestamps')}</li></ul></article></div>
      <aside className={styles.tip}><Shield size={20} /><p>{tx('ログイン中はゲームセンターと同じアカウントへ自動保存。同じアカウントで別端末にログインすると進行を復元します。ゲストはそのブラウザ内だけに保存します。戦闘途中で閉じた場合、育成や獲得済みの報酬は残り、戦闘は島の入口から再挑戦です。', 'Members autosave to the same account as the medal center and can restore on another device. Guests save only in this browser. Closing mid-battle keeps training and already-earned rewards, but the battle restarts from the island entrance.')}</p></aside>
      <p>{tx('通信が切れた場合は端末内の記録を保持して再送します。別端末へ移る前に、保存表示が「アカウントに自動保存」へ戻っていることを確認してください。', 'Offline progress is kept on the device and retried. Before changing devices, check that the save indicator has returned to “Account autosave”.')}</p>
    </section>
    <footer className={styles.footer}><Link href="/games/starcat-caravan">{tx('仲間たちと冒険へ', 'Back to your companions')}<ArrowRight size={16} /></Link><span>{tx('課金なし · 進行の保存にはログイン', 'No purchases · Sign in to save across devices')}</span></footer>
  </div></main>;
}

export default function StarcatGuide() { const { language } = useGameLanguage(); return <GuideContent language={language} />; }
