'use client';

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, BookOpen, Check, Compass, Gem, MapPin, MessageCircle, MousePointer2, Sparkles, Tent, Users, X } from 'lucide-react';
import { STAGES, type Character, type Language } from './data';
import type { Action, GameState } from './engine';
import { adventureOf, worldViewBox, CHAPTERS, fragmentCount, MAP_HEIGHT, MAP_WIDTH, near, objective, pathTo, PLACES, terrain, TILE, type Direction, type Place, type Point } from './adventure';
import { CatSprite } from './CatSprite';
import styles from './AdventureWorld.module.css';

type Props = { game: GameState; characters: readonly Character[]; language: Language; ready: boolean; readGame: () => GameState; dispatch: (action: Exclude<Action, { type: 'load' }>) => void; onParty: () => void; onWish: () => void };
type Conversation = { place: Place; lines: string[]; page: number; battle?: boolean };
const arrows: { direction: Direction; Icon: typeof ArrowUp; ja: string; en: string }[] = [
  { direction: 'up', Icon: ArrowUp, ja: '上へ歩く', en: 'Walk up' }, { direction: 'left', Icon: ArrowLeft, ja: '左へ歩く', en: 'Walk left' },
  { direction: 'down', Icon: ArrowDown, ja: '下へ歩く', en: 'Walk down' }, { direction: 'right', Icon: ArrowRight, ja: '右へ歩く', en: 'Walk right' },
];

export default function AdventureWorld({ game, characters, language, ready, readGame, dispatch, onParty, onWish }: Props) {
  const tx = (ja: string, en: string) => language === 'ja' ? ja : en;
  const a = adventureOf(game.save);
  const position = game.journey ?? a.position;
  const chapter = CHAPTERS[a.region];
  const party = game.save.team.flatMap((id) => { const cat = characters.find((entry) => entry.id === id); return cat && Object.hasOwn(game.save.owned, id) ? [cat] : []; });
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [journal, setJournal] = useState(false);
  const [moving, setMoving] = useState(false);
  const [facing, setFacing] = useState<Direction>('down');
  const [viewport, setViewport] = useState({width:960,height:640,compact:false});
  const [trail, setTrail] = useState<Point[]>([]);
  const regionRef = useRef<HTMLElement>(null);
  const mapRef = useRef<SVGSVGElement>(null);
  const talkRef = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const route = useRef<Point[]>([]);
  const lastPoint = useRef(position);
  const paletteId = useId().replaceAll(':', '');
  const nearest = PLACES.find((place) => near(position, place));
  const locked = !ready || !!conversation || journal;

  useEffect(() => {
    const element = mapRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const {width,height} = entry.target.getBoundingClientRect();
      const compact = getComputedStyle(entry.target).getPropertyValue('--compact-camera').trim() === '1';
      setViewport({width,height,compact});
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (lastPoint.current.x !== position.x || lastPoint.current.y !== position.y) {
      const previous = lastPoint.current;
      lastPoint.current = position;
      setTrail((points) => [previous, ...points].slice(0, 6));
    }
  }, [position]);

  const stop = useCallback(() => {
    if (timer.current !== null) clearInterval(timer.current);
    timer.current = null;
    route.current = [];
    setMoving(false);
    dispatch({ type: 'checkpoint' });
  }, [dispatch]);
  useEffect(() => {
    const hidden = () => { if (document.hidden) stop(); };
    window.addEventListener('blur', stop);
    document.addEventListener('visibilitychange', hidden);
    return () => { window.removeEventListener('blur', stop); document.removeEventListener('visibilitychange', hidden); if (timer.current !== null) clearInterval(timer.current); dispatch({ type: 'checkpoint' }); };
  }, [dispatch, stop]);

  function openPlace(place: Place) {
    const currentGame = readGame();
    const save = currentGame.save;
    const current = adventureOf(save);
    const point = currentGame.journey ?? current.position;
    if (!ready || !near(point, PLACES.find((entry) => entry.id === place)!)) return;
    stop();
    const story = CHAPTERS[current.region];
    let lines: string[];
    if (place === 'guide') lines = current.restored.includes(current.region)
      ? [tx('ありがとう。君たちの旅を、この島はずっと覚えているよ。', 'Thank you. This island will remember your caravan’s journey.')]
      : [story.story[language], tx('西と東の宝箱からかけらを一つずつ。影の砦を攻略したら、星の灯台へ届けてね。仲間はいつでもキャンプから編成・育成できるよ。', 'Find one fragment in each chest. Reclaim the fortress, then bring both to the star lantern. You can change and train your party at camp.')];
    else if (place === 'west' || place === 'east') lines = current.opened.includes(`${current.region}:${place}`)
      ? [tx('この宝箱はもう開けた。灯火のかけらも、報酬も、旅の記録に残っている。', 'This chest has already been opened. Its fragment and rewards are safely in your journal.')]
      : [tx('古い宝箱を見つけた。中で、小さな星が瞬いている……。', 'An old chest! A little star is twinkling inside…'), tx('灯火のかけら ×1、星のしずく +100、コイン +120 を見つけた！', 'Found a lantern fragment ×1, Stardrops +100 and coins +120!')];
    else if (place === 'beacon') lines = current.restored.includes(current.region) ? [story.ending[language]]
      : !current.met.includes(current.region) ? [tx('灯台の火は消えている。この島の灯守なら、直し方を知っているかもしれない。', 'The lantern is dark. The lightkeeper may know how to restore it.')]
      : fragmentCount(current) < 2 ? [tx(`灯火のかけらがまだ足りない（${fragmentCount(current)}/2）。川の両岸にある宝箱を探そう。`, `You need both fragments (${fragmentCount(current)}/2). Search the chests on both sides of the river.`)]
      : !save.cleared.includes(current.region) ? [tx('かけらが淡く光る。でも砦の影が、灯台を覆っている。仲間と影の砦を攻略しよう。', 'The fragments glow faintly, but the fortress casts a shadow over the lantern. Reclaim it with your companions.')]
      : current.region === 5 && current.restored.length < 5 ? [tx('最後の灯火を結ぶには、ほかの五つの灯台にも光が必要。上の島名から戻って、灯火を届けよう。', 'The final light needs all five earlier lanterns. Travel back using the island names and restore their starlight first.')]
      : [tx('二つのかけらを重ねると、仲間たちの願いが光になった。', 'As the two fragments meet, your companions’ wishes turn into light.'), story.ending[language], tx('灯火を取り戻した！ 星のしずく +150、コイン +200。旅の記録に保存しました。', 'Starlight restored! Stardrops +150, coins +200. Your journey is kept in the journal.')];
    else if (place === 'fortress') lines = save.encounter ? [tx('中断中の戦闘が旅の記録に残っています。上のカードから再開するか、最初から挑む・記録を終了を選んでね。','A saved battle is in your journal. Use the card above to resume, restart, or end that attempt.')] : [tx('影の群れと、この島を守るボスが待ち受けている。仲間は最初から一緒に戦うよ。歩いて赤い攻撃を避け、星の絆で大きな一撃を出そう。', 'The shadows and their guardian await. Your companions fight alongside you from the start. Walk out of red attack warnings and use Star bond for a big hit.'), tx('途中で中断しても探索・育成に加え、戦闘中のHP・敵・ゲージを保存して再開できるよ。準備はいい？', 'Suspending keeps exploration, training, battle HP, enemies and charge so you can resume. Ready?')];
    else if (place === 'sign') lines = [tx('西に旅のキャンプ、中央に星渡りの橋。東に影の砦、北東に星の灯台。道に迷ったら、マップをタップして歩いてみよう。', 'Camp lies west, the star bridge in the middle, the fortress east, and the lantern northeast. Tap a place on the map to walk there.')];
    else lines = [tx(`${party[0].name.ja}「みんな、準備はいい？ 一緒なら、もう少し先まで行けそうだね。」`, `${party[0].name.en}: “Ready, everyone? Together, we can go a little farther.”`), tx('仲間を変えても、宝箱や灯火の進行はそのまま。コインで育成してから、またここへ帰ってこよう。', 'Changing companions keeps your chests and story progress. Train with coins, then return to the trail.')];
    setConversation({ place, lines, page: 0, battle: place === 'fortress' && !save.encounter });
  }
  const finishConversation = () => {
    if (!conversation || !ready) return;
    if (conversation.page < conversation.lines.length - 1) {
      if (!conversation.battle && conversation.page + 1 === conversation.lines.length - 1) dispatch({ type: 'interact', place: conversation.place });
      setConversation({ ...conversation, page: conversation.page + 1 }); return;
    }
    if (conversation.battle) dispatch({ type: 'encounter' });
    else dispatch({ type: 'interact', place: conversation.place });
    setConversation(null);
    regionRef.current?.focus({ preventScroll: true });
  };
  const beginWalk = (direction: Direction) => {
    if (locked) return;
    regionRef.current?.focus({ preventScroll: true });
    stop(); setFacing(direction); setMoving(true); dispatch({ type: 'walk', direction });
    timer.current = setInterval(() => dispatch({ type: 'walk', direction }), 145);
  };
  const keyDown = (event: KeyboardEvent) => {
    if (event.target instanceof HTMLElement && (event.target.closest('button, a, input, textarea, select') || event.altKey || event.ctrlKey || event.metaKey)) return;
    const direction = ({ ArrowUp: 'up', w: 'up', W: 'up', ArrowDown: 'down', s: 'down', S: 'down', ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right' } as Record<string, Direction>)[event.key];
    if (direction) { event.preventDefault(); if (!event.repeat) beginWalk(direction); }
    if ((event.key === 'e' || event.key === 'E' || event.key === 'Enter') && !locked) { event.preventDefault(); if (nearest) openPlace(nearest.id); }
    if (event.key === 'Escape') { stop(); setConversation(null); setJournal(false); }
  };
  const tapMap = (event: PointerEvent<SVGSVGElement>) => {
    if (locked || event.button !== 0) return;
    const matrix = mapRef.current?.getScreenCTM();
    if (!matrix) return;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    const clickedPlace = event.target instanceof Element ? event.target.closest('[data-place]')?.getAttribute('data-place') : null;
    const location = PLACES.find((place) => place.id === clickedPlace);
    const destination = location ?? { x: Math.floor(point.x / TILE), y: Math.floor(point.y / TILE) };
    const target = PLACES.find((p) => p.x === destination.x && p.y === destination.y);
    const currentGame = readGame();
    const current = currentGame.journey ?? adventureOf(currentGame.save).position;
    const path = pathTo(current, destination);
    stop(); regionRef.current?.focus({ preventScroll: true });
    if (!path.length) { if (target && near(current, target)) openPlace(target.id); return; }
    let currentPoint = current;
    route.current = path; setMoving(true);
    timer.current = setInterval(() => {
      const next = route.current.shift();
      if (!next) { stop(); if (target) openPlace(target.id); return; }
      const direction = next.x > currentPoint.x ? 'right' : next.x < currentPoint.x ? 'left' : next.y > currentPoint.y ? 'down' : 'up';
      currentPoint = next;
      setFacing(direction); dispatch({ type: 'walk', direction });
    }, 145);
  };
  useEffect(() => { if (conversation) talkRef.current?.focus({ preventScroll: true }); }, [conversation]);
  useEffect(() => {
    if (!conversation && !journal) return;
    const trap = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setConversation(null); setJournal(false); regionRef.current?.focus({preventScroll:true}); }
      if (event.key !== 'Tab') return;
      const buttons = Array.from(regionRef.current?.querySelectorAll<HTMLButtonElement>('[role="dialog"] button:not(:disabled)') ?? []);
      const first=buttons[0], last=buttons.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown',trap);
    return () => document.removeEventListener('keydown',trap);
  },[conversation,journal]);

  const camera = worldViewBox(position,viewport.width,viewport.height,viewport.compact);
  const beaconLit = a.restored.includes(a.region);
  return <section ref={regionRef} className={styles.world} tabIndex={0} aria-label={tx('冒険マップ。矢印キーかWASDで移動、Eで調べる', 'Adventure map. Move with arrows or WASD; E to interact')} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) stop(); }} onKeyDown={keyDown} onKeyUp={(event) => { if (/^(Arrow|[wasdWASD]$)/.test(event.key)) stop(); }}>
    <div className={styles.chapterBar}><div><span>THE STARLIGHT CHRONICLES · {String(a.region + 1).padStart(2, '0')}</span><h2>{chapter.title[language]}</h2></div><div><button aria-label={tx('旅の手帳','Travel journal')} onClick={() => { stop(); setJournal(true); }} disabled={!ready || !!conversation || journal}><BookOpen size={16} /><span>{tx('旅の手帳', 'Journal')}</span><b>{a.restored.length}/6</b></button><button aria-label={tx('仲間・育成','Party & training')} disabled={!ready || !!conversation || journal} onClick={() => { stop(); onParty(); }}><Users size={16} /><span>{tx('仲間・育成', 'Party & training')}</span></button></div></div>
    <nav className={styles.regions} aria-label={tx('島を選ぶ', 'Choose an island')}>{STAGES.map((region, i) => <button key={i} disabled={!ready || (i > 0 && !game.save.cleared.includes(i - 1)) || !!conversation || journal} aria-pressed={a.region === i} onClick={() => { stop(); dispatch({ type: 'travel', region: i }); }}><span>{a.restored.includes(i) ? '✧' : String(i + 1).padStart(2, '0')}</span>{region.name[language]}</button>)}</nav>
    <div className={styles.field}>
      <svg ref={mapRef} viewBox={camera} className={styles.map} onPointerDown={tapMap} role="img" aria-label={tx(`探索マップ：${STAGES[a.region].name.ja}。現在位置 ${position.x},${position.y}`, `Exploration: ${STAGES[a.region].name.en}. Position ${position.x},${position.y}`)}>
        <defs><linearGradient id={`${paletteId}water`} x2="0" y2="1"><stop stopColor={chapter.water}/><stop offset="1" stopColor="#81bac3"/></linearGradient><radialGradient id={`${paletteId}light`}><stop stopColor="#fff3ae" stopOpacity=".6"/><stop offset="1" stopColor="#fff3ae" stopOpacity="0"/></radialGradient></defs>
        <rect width="960" height="640" fill={chapter.grass}/>
        {Array.from({ length: MAP_WIDTH * MAP_HEIGHT }, (_, index) => {
          const x = index % MAP_WIDTH, y = Math.floor(index / MAP_WIDTH), tile = terrain(x, y), seed = (x * 17 + y * 29) % 13;
          return <g key={index} transform={`translate(${x * TILE} ${y * TILE})`}>
            {tile === 'path' && <><rect width="40" height="40" fill="#cebb8a"/><path d={`M${seed} 9h5M23 29h3`} stroke="#a18c66" strokeWidth="1" opacity=".4"/></>}
            {tile === 'water' && <><rect width="40" height="40" fill={`url(#${paletteId}water)`}/><path d={`M3 ${10 + seed}q7-4 14 0t16 0M8 32h11`} stroke="#c4e4d4" fill="none" opacity=".4"/></>}
            {tile === 'bridge' && <><rect width="40" height="40" fill={chapter.water}/><rect y="2" width="40" height="36" fill="#b69b72"/>{[5,13,21,29,37].map((n) => <path key={n} d={`M${n} 2v36`} stroke="#77664d"/>)}<path d="M0 2h40M0 38h40" stroke="#e7c78a" strokeWidth="4"/></>}
            {tile === 'grass' && seed < 9 && <g opacity=".5"><path d={`M${8 + seed} 26l-2-4m2 4 3-6M29 9l2-4`} stroke="#d0d7a0" strokeWidth="1.3"/>{seed < 3 && <><circle cx="10" cy="13" r="2" fill="#eee7b6"/><circle cx="31" cy="30" r="1.5" fill="#e8b6aa"/></>}</g>}
            {tile === 'rock' && <><ellipse cx="20" cy="31" rx="18" ry="7" fill="#1d3646" opacity=".2"/><path d="M3 27L11 8L29 6L38 24L30 33H10Z" fill="#a5b5aa" stroke="#607f78" strokeWidth="2"/><path d="M11 8L21 20L29 6M21 20L30 33" fill="none" stroke="#d2d9bd"/></>}
          </g>;
        })}
        <path d="M20 20H940V620H20Z" fill="none" stroke="#395d59" strokeWidth="32" opacity=".28"/>
        {Array.from({ length: MAP_WIDTH * MAP_HEIGHT }, (_, index) => { const x = index % MAP_WIDTH, y = Math.floor(index / MAP_WIDTH); return terrain(x,y) === 'tree' ? <g key={index} transform={`translate(${x*TILE} ${y*TILE})`}><ellipse cx="20" cy="34" rx="25" ry="11" fill="#213f3c" opacity=".25"/><path d="M17 26v15h8V24" fill="#756451"/><path d="M20-13L-8 22H5L-5 35H45L35 22H48Z" fill={chapter.tree} stroke="#b5c291" strokeWidth="1.2"/><path d="M20-7L0 20H11L5 29" fill="none" stroke="#a9c291" opacity=".4"/></g> : null; })}
        {PLACES.map((place) => <g key={place.id} data-place={place.id} transform={`translate(${place.x*TILE} ${place.y*TILE})`}>
          <ellipse cx="20" cy="33" rx="30" ry="10" fill="#24453c" opacity=".24"/>
          {place.id === 'camp' && <><path d="M-30 30L20-40L70 30Z" fill="#e2c08b" stroke="#775c47" strokeWidth="3"/><path d="M20-40L42 30H70Z" fill="#b8946b"/><path d="M7 30L20-3L34 30" fill="#3f5c62"/><path d="M-30 30L-38 41M70 30L77 41" stroke="#f2d9a3" strokeWidth="2"/><path d="M20-40V-60l27 7-27 10" fill="#88b8b3" stroke="#e1cc97" strokeWidth="2"/></>}
          {place.id === 'guide' && <g><path d="M8 16L4 36H37L32 14Z" fill="#d9b16f" stroke="#66534b" strokeWidth="2"/><path d="M4 4V-15L16-7Q23-10 29-6L40-15L37 6Q32 23 20 19Q4 20 4 4Z" fill="#eee0bf" stroke="#756d56" strokeWidth="2"/><path d="M12 3h3M28 3h3" stroke="#42574f" strokeWidth="3"/><path d="M46 35V0M41 0h11v-12H41Z" fill="#ffdd88" stroke="#8a7452" strokeWidth="2"/><text x="20" y="-28" textAnchor="middle" fontSize="19" fill="#fff2c3">!</text></g>}
          {(place.id === 'west' || place.id === 'east') && <g><path d="M0 8Q20-10 40 8V20H0Z" fill={a.opened.includes(`${a.region}:${place.id}`) ? '#6d725c' : '#bb8557'} stroke="#634e43" strokeWidth="2"/><rect y="16" width="40" height="22" rx="3" fill="#a97b50" stroke="#634e43" strokeWidth="2"/><path d="M8 2v34M32 2v34" stroke="#efd093" strokeWidth="4"/><rect x="17" y="16" width="7" height="11" rx="2" fill="#f5d797"/>{!a.opened.includes(`${a.region}:${place.id}`) && <text x="20" y="-10" textAnchor="middle" fill="#fff2b2" fontSize="23">✧</text>}</g>}
          {place.id === 'beacon' && <><circle cx="20" cy="-10" r="75" fill={`url(#${paletteId}light)`} opacity={beaconLit ? 1 : .16}/><path d="M3 31L8-6H32L37 31Z" fill="#c3bd9d" stroke="#6d7a72" strokeWidth="2"/><path d="M3-8H37L30-21H10Z" fill="#89a69c"/><path d="M10-21V-48H30V-21" fill={beaconLit ? '#fff1ae' : '#536a70'} stroke="#c6b887" strokeWidth="3"/><path d="M2-48L20-64L38-48Z" fill="#758d82"/>{beaconLit && <text x="20" y="-27" textAnchor="middle" fill="#fffbea" fontSize="22">✦</text>}</>}
          {place.id === 'fortress' && <><path d="M-17 36V-24H0V-40H15V-24H33V-40H48V-24H62V36Z" fill="#706881" stroke="#44445b" strokeWidth="3"/><path d="M9 36V13Q22-8 37 13V36" fill="#343b50"/><path d="M-6-6v14M48-6v14" stroke="#e2bd8d" strokeWidth="5"/><text x="22" y="-56" textAnchor="middle" fontSize="24" fill="#e7d5e7">{game.save.cleared.includes(a.region) ? '✓' : '☾'}</text></>}
          {place.id === 'sign' && <><path d="M20 0v35" stroke="#78694c" strokeWidth="6"/><path d="M-2-6H33L43 5L33 16H-2Z" fill="#d8bf87" stroke="#8b7856" strokeWidth="2"/><path d="M8 5h22" stroke="#a18b61" strokeWidth="2"/></>}
          <text x="20" y={place.id === 'camp' ? 59 : 57} textAnchor="middle" fill="#fff5d7" stroke="#304c48" strokeWidth="4" paintOrder="stroke" fontSize="12" fontWeight="600">{place.id === 'guide' ? chapter.keeper[language] : place.name[language]}</text>
        </g>)}
        {[...party].reverse().map((cat, reverseIndex) => {
          const index = party.length - 1 - reverseIndex;
          const point = index === 0 ? position : trail[Math.min(index * 2 - 1, trail.length - 1)] ?? position;
          return <g key={cat.id} className={styles.walker} style={{ transform: `translate(${point.x*TILE+20}px,${point.y*TILE+20}px)` }}>
            <ellipse cy="14" rx="16" ry="6" fill="#203e40" opacity=".28"/><g className={moving ? styles.stride : undefined} style={{ animationDelay: `${index * -80}ms` }}><svg x="-25" y="-42" width="50" height="58" className={facing === 'left' ? styles.faceLeft : undefined}><CatSprite cat={cat}/></svg></g>
            {index === 0 && <path d="M-5-52H5L0-47Z" fill="#ffedaf"/>}
          </g>;
        })}
      </svg>
      <div className={styles.objective}><span><Compass size={16}/>{tx('現在の目的', 'CURRENT QUEST')}</span><strong>{objective(game.save)[language]}</strong><small><MapPin size={12}/>{STAGES[a.region].name[language]} · {position.x}, {position.y}</small></div>
      <div className={styles.fragmentBadge}><Sparkles size={15}/>{tx('灯火のかけら', 'Lantern fragments')} {fragmentCount(a)}/2</div>
      <div className={styles.dpad} aria-label={tx('移動ボタン', 'Movement controls')}>{arrows.map(({ direction, Icon, ja, en }) => <button key={direction} type="button" data-direction={direction} aria-label={tx(ja,en)} disabled={locked} onPointerDown={(event) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); beginWalk(direction); }} onPointerUp={stop} onPointerCancel={stop} onLostPointerCapture={stop} onClick={(event) => { if (event.detail === 0 && !locked) { dispatch({ type: 'walk', direction }); dispatch({ type: 'checkpoint' }); } }}><Icon size={22}/></button>)}</div>
      <button className={styles.interact} disabled={locked || !nearest} onClick={() => { if (nearest) openPlace(nearest.id); }}><MessageCircle size={21}/><strong>{nearest ? nearest.name[language] : tx('近くを調べる', 'Look nearby')}</strong><small>{tx('調べる', 'Interact')} · E</small></button>
      {conversation && <div className={styles.scrim}><div className={styles.dialogue} role="dialog" aria-modal="true" aria-label={tx('旅の会話', 'Adventure dialogue')} onKeyDown={(event) => { event.stopPropagation(); if (event.key === 'Escape') { setConversation(null); regionRef.current?.focus({preventScroll:true}); } }}><div className={styles.speaker}><span>{conversation.place === 'guide' ? chapter.keeper[language] : conversation.place === 'camp' ? party[0].name[language] : PLACES.find((p) => p.id === conversation.place)!.name[language]}</span><button aria-label={tx('会話を閉じる', 'Close dialogue')} onClick={() => { setConversation(null); regionRef.current?.focus({preventScroll:true}); }}><X size={18}/></button></div><p>{conversation.lines[conversation.page]}</p><div className={styles.dialogueActions}><small>{conversation.page+1} / {conversation.lines.length}</small>{conversation.place === 'camp' && <><button onClick={() => { dispatch({type:'checkpoint'}); onParty(); }}><Users size={15}/>{tx('編成・育成', 'Train party')}</button><button onClick={onWish}><Gem size={15}/>{tx('星の召喚', 'Make a wish')}</button></>}<button ref={talkRef} onClick={finishConversation} disabled={!ready}>{conversation.page < conversation.lines.length-1 ? tx('つづける', 'Continue') : conversation.battle ? tx('砦に挑む', 'Enter battle') : tx('受けとめる', 'Continue journey')}<ArrowRight size={16}/></button></div></div></div>}
      {journal && <div className={styles.scrim}><div className={styles.journal} role="dialog" aria-modal="true" aria-label={tx('旅の手帳', 'Travel journal')}><header><div><span>THE STARLIGHT CHRONICLES</span><h3>{tx('六つの灯火の物語', 'The tale of six lanterns')}</h3></div><button autoFocus aria-label={tx('手帳を閉じる', 'Close journal')} onClick={() => {setJournal(false); regionRef.current?.focus({preventScroll:true});}}><X size={20}/></button></header><p>{tx('出会った仲間、拾ったかけら、取り戻した光。旅の一歩ずつが、ここに残ります。', 'Companions met, fragments found, starlight restored. Every little step belongs here.')}</p><ol>{CHAPTERS.map((story,i) => <li key={i} data-complete={a.restored.includes(i)}><span>{a.restored.includes(i) ? <Check size={19}/> : String(i+1).padStart(2,'0')}</span><div><strong>{story.title[language]}</strong><small>{a.restored.includes(i) ? tx('灯火を復元・物語クリア', 'Starlight restored · Story complete') : a.met.includes(i) ? tx(`かけら ${fragmentCount(a,i)}/2 · 砦 ${game.save.cleared.includes(i) ? '攻略済み' : '未攻略'}`, `Fragments ${fragmentCount(a,i)}/2 · Fortress ${game.save.cleared.includes(i) ? 'cleared' : 'waiting'}`) : tx('まだ始まっていない物語', 'A story yet to begin')}</small></div></li>)}</ol><p className={styles.saveNote}>{tx('探索位置・宝箱・会話・灯火は進行に保存。中断した戦闘・昇格した★・実績バッジも保存。別端末へ移る前にアカウント保存の完了を確認してください。', 'Position, chests, conversations and restored lanterns are saved. Saved battles, ascended stars and badges are kept too. Check account sync before changing devices.')}</p></div></div>}
    </div>
    <div className={styles.trailFooter}><span><MousePointer2 size={14}/>{tx('マップをタップして移動 · 矢印 / WASD · Eで調べる', 'Tap to walk · Arrows / WASD · E to interact')}</span><span><Tent size={14}/>{tx('キャンプで仲間を変えよう', 'Change companions at camp')}</span></div>
    <div className={styles.partyStrip}>{party.map((cat,i) => <button key={cat.id} className={styles.partyMember} aria-pressed={i === 0} aria-label={tx(`${cat.name.ja}を先頭にする`, `Lead with ${cat.name.en}`)} disabled={!ready || !!conversation || journal} onClick={() => {dispatch({type:'leader', id:cat.id}); regionRef.current?.focus({preventScroll:true});}}><CatSprite cat={cat}/><span><small>{i === 0 ? tx('操作する仲間', 'Party leader') : tx('押すと先頭に', 'Tap to lead')}</small><strong>{cat.name[language]}</strong><small>Lv. {game.save.owned[cat.id].level}</small></span></button>)}<button disabled={!ready || !!conversation || journal} onClick={onParty}><Users size={16}/>{tx('編成・育成', 'Party & training')}</button></div>
  </section>;
}
