'use client';

import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus, RefreshCw, Save } from 'lucide-react';
import { useAuth } from '@/providers/AuthProvider';
import { auth } from '@/lib/firebaseConnect';
import { CatSprite } from './CatSprite';
import { ELEMENTS, ROLES, type Character } from './data';
import { parseCharacterCatalog, validateCharacters, type CharacterCatalog } from './catalog';

const ENDPOINT = '/api/game/starcat/catalog';
const inputClass = 'mt-1 block w-full rounded-lg border px-3 py-2 text-sm disabled:opacity-60';
const fieldStyle: CSSProperties = { background: 'var(--admin-surface-raised)', borderColor: 'var(--admin-border-strong)', color: 'var(--admin-text)' };
const buttonClass = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50';
const panelStyle: CSSProperties = { background: 'var(--admin-surface)', borderColor: 'var(--admin-border)', color: 'var(--admin-text)' };
const actionStyle: CSSProperties = { background: 'var(--admin-accent)', color: 'var(--admin-primary-text)', borderColor: 'var(--admin-accent)' };

function newCharacter(): Character {
  return { id: '', name: { ja: '', en: '' }, title: { ja: '', en: '' }, rarity: 3, element: 'fire', role: 'fighter', fur: '#f6bd79', accent: '#ed9870', hp: 180, attack: 30, range: 6, speed: 7, cost: 45, cooldown: 3 };
}

export async function readCatalogResponse(response: Response, operation: 'load' | 'save'): Promise<CharacterCatalog> {
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const fallback = operation === 'load' ? 'キャラクターを読み込めませんでした。時間をおいて再試行してください。' : '保存できませんでした。編集中の内容は残っています。時間をおいて再試行してください。';
    const message = body !== null && typeof body === 'object' && 'error' in body && typeof body.error === 'string' && body.error.trim() ? body.error : fallback;
    throw new Error(message);
  }
  const body: unknown = await response.json().catch(() => null);
  const catalog = parseCharacterCatalog(body);
  if (!catalog) throw new Error(operation === 'load' ? 'キャラクターデータの形式を確認できませんでした。再読込してください。' : '保存結果を確認できませんでした。編集中の内容を控えてから再読込してください。');
  return catalog;
}

async function readCatalog(signal?: AbortSignal): Promise<CharacterCatalog> {
  const response = await fetch(ENDPOINT, { cache: 'no-store', signal });
  return readCatalogResponse(response, 'load');
}

const combatFields = [
  { key: 'hp', label: 'HP', min: 1, max: 100000, step: 1 },
  { key: 'attack', label: '攻撃・回復力', min: 1, max: 10000, step: 1 },
  { key: 'range', label: '射程', min: 1, max: 40, step: 0.1 },
  { key: 'speed', label: '移動速度', min: 0.1, max: 30, step: 0.1 },
  { key: 'cost', label: '出撃エネルギー', min: 1, max: 200, step: 1 },
  { key: 'cooldown', label: '再出撃までの秒数', min: 0.1, max: 60, step: 0.1 },
] as const;

export function CharacterFields({ character, saved, onChange }: { character: Character; saved: boolean; onChange: (next: Character) => void }) {
  const change = (patch: Partial<Character>) => onChange({ ...character, ...patch });
  return <div className="space-y-6">
    <div className="flex items-center gap-5">
      <div className="h-28 w-24 shrink-0 rounded-xl p-2" style={{ background: 'var(--admin-surface-muted)' }}><CatSprite cat={character} /></div>
      <div><h2 className="text-xl font-semibold">{character.name.ja || '新しい仲間'}</h2><p className="mt-1 text-sm" style={{ color: 'var(--admin-text-muted)' }}>{'★'.repeat(character.rarity)} · {ELEMENTS[character.element].name.ja} · {ROLES[character.role].ja}</p></div>
    </div>
    <label className="block text-sm font-medium">キャラクターID
      <input className={inputClass} style={fieldStyle} value={character.id} disabled={saved} required pattern="[a-z][a-z0-9\-]*" maxLength={48} autoComplete="off" spellCheck={false} onChange={(event) => change({ id: event.target.value })} aria-describedby="starcat-id-help" />
      <span id="starcat-id-help" className="mt-1 block text-xs font-normal" style={{ color: 'var(--admin-text-muted)' }}>{saved ? '保存済みIDは変更できません。プレイヤーの所持データと結びついています。' : '半角英小文字で始め、英小文字・数字・ハイフンを使います。保存後は変更できません。'}</span>
    </label>
    <div className="grid gap-4 sm:grid-cols-2">
      {(['ja', 'en'] as const).map((language) => <div key={language} className="space-y-4">
        <label className="block text-sm font-medium">名前（{language === 'ja' ? '日本語' : 'English'}）<input className={inputClass} style={fieldStyle} value={character.name[language]} required maxLength={80} onChange={(event) => change({ name: { ...character.name, [language]: event.target.value } })} /></label>
        <label className="block text-sm font-medium">肩書き（{language === 'ja' ? '日本語' : 'English'}）<input className={inputClass} style={fieldStyle} value={character.title[language]} required maxLength={120} onChange={(event) => change({ title: { ...character.title, [language]: event.target.value } })} /></label>
      </div>)}
    </div>
    <div className="grid gap-4 sm:grid-cols-3">
      <label className="block text-sm font-medium">レア度<select className={inputClass} style={fieldStyle} value={character.rarity} onChange={(event) => change({ rarity: Number(event.target.value) as Character['rarity'] })}>{[3, 4, 5].map((rarity) => <option key={rarity} value={rarity}>★{rarity}</option>)}</select></label>
      <label className="block text-sm font-medium">属性<select className={inputClass} style={fieldStyle} value={character.element} onChange={(event) => change({ element: event.target.value as Character['element'] })}>{(Object.keys(ELEMENTS) as Character['element'][]).map((element) => <option key={element} value={element}>{ELEMENTS[element].name.ja}</option>)}</select></label>
      <label className="block text-sm font-medium">役割<select className={inputClass} style={fieldStyle} value={character.role} onChange={(event) => change({ role: event.target.value as Character['role'] })}>{(Object.keys(ROLES) as Character['role'][]).map((role) => <option key={role} value={role}>{ROLES[role].ja}</option>)}</select></label>
    </div>
    <div className="grid gap-4 sm:grid-cols-2">
      {([{ key: 'fur', label: '毛色' }, { key: 'accent', label: '衣装・アクセント色' }] as const).map(({ key, label }) => <label key={key} className="block text-sm font-medium">{label}<input type="color" className={`${inputClass} h-12`} style={fieldStyle} value={character[key]} onChange={(event) => change({ [key]: event.target.value })} /></label>)}
    </div>
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {combatFields.map(({ key, label, min, max, step }) => <label key={key} className="block text-sm font-medium">{label}<input type="number" className={inputClass} style={fieldStyle} value={character[key] || ''} min={min} max={max} step={step} required onChange={(event) => change({ [key]: event.target.value === '' ? 0 : Number(event.target.value) })} /></label>)}
    </div>
  </div>;
}

function CatalogEditor({ currentUser }: { currentUser: NonNullable<ReturnType<typeof useAuth>['currentUser']> }) {
  const [saved, setSaved] = useState<CharacterCatalog | null>(null);
  const [draft, setDraft] = useState<Character[]>([]);
  const [selected, setSelected] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [conflict, setConflict] = useState(false);
  const [confirmReload, setConfirmReload] = useState(false);
  const mounted = useRef(false);
  const dirty = saved !== null && JSON.stringify(draft) !== JSON.stringify(saved.characters);
  const busy = loading || saving;

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    void readCatalog(controller.signal).then((catalog) => {
      if (controller.signal.aborted) return;
      setSaved(catalog); setDraft(catalog.characters);
    }).catch((reason: unknown) => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : '読み込みに失敗しました。');
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { mounted.current = false; controller.abort(); };
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  async function reload() {
    setLoading(true); setError(''); setMessage('');
    try {
      const catalog = await readCatalog();
      if (!mounted.current) return;
      setSaved(catalog); setDraft(catalog.characters); setSelected(0); setConflict(false); setConfirmReload(false);
      setMessage('最新のキャラクターを読み込みました。');
    } catch (reason) {
      if (mounted.current) setError(reason instanceof Error ? reason.message : '読み込みに失敗しました。編集中の内容は残っています。');
    } finally { if (mounted.current) setLoading(false); }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!saved || busy || !dirty || conflict) return;
    setError(''); setMessage('');
    let characters: Character[];
    try { characters = validateCharacters(draft); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '入力内容を確認してください。'); return; }
    setSaving(true);
    try {
      const token = await currentUser.getIdToken();
      if (!mounted.current || auth?.currentUser?.uid !== currentUser.uid) return;
      const response = await fetch(ENDPOINT, { method: 'PUT', cache: 'no-store', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: saved.revision, characters }) });
      if (!mounted.current) return;
      if (response.status === 409) {
        setConflict(true);
        setError('別の画面でキャラクターが更新されました。編集中の内容は残っています。内容を控えてから、最新データを再読込してください。');
        return;
      }
      const catalog = await readCatalogResponse(response, 'save');
      if (!mounted.current) return;
      setSaved(catalog); setDraft(catalog.characters); setMessage('保存しました。ゲームを開き直すと、新しい内容が反映されます。');
    } catch (reason) {
      if (mounted.current) setError(reason instanceof Error ? reason.message : '保存できませんでした。編集中の内容は残っています。');
    } finally { if (mounted.current) setSaving(false); }
  }

  const character = draft[selected];
  return <main className="admin-console min-h-screen px-4 py-8 sm:px-8" style={{ background: 'var(--admin-page)', color: 'var(--admin-text)' }}>
    <div className="mx-auto max-w-6xl">
      <Link href="/admin#games" onClick={(event) => { if (dirty && !window.confirm('未保存の編集があります。編集を破棄して管理画面へ戻りますか？')) event.preventDefault(); }} className="mb-6 inline-flex min-h-11 items-center gap-2 text-sm" style={{ color: 'var(--admin-text-muted)' }}><ArrowLeft size={16} />管理画面に戻る</Link>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div><h1 className="text-2xl font-semibold">星ねこキャラバン · キャラクター管理</h1><p className="mt-2 max-w-2xl text-sm leading-6" style={{ color: 'var(--admin-text-muted)' }}>仲間の追加・名前・見た目・能力を編集します。保存した内容は、次にゲームを開いたときに反映されます。既存の所持・育成データはIDで引き継がれます。</p></div>
        <button className={buttonClass} style={fieldStyle} disabled={busy} onClick={() => { if (dirty) setConfirmReload(true); else void reload(); }}><RefreshCw size={16} />最新を再読込</button>
      </header>
      {error && <div role="alert" className="mb-4 rounded-lg border p-4 text-sm" style={{ background: 'var(--admin-danger-soft)', borderColor: 'var(--admin-danger-border)', color: 'var(--admin-danger-text)' }}>{error}</div>}
      {message && <p role="status" className="mb-4 rounded-lg p-4 text-sm" style={{ background: 'var(--admin-success-soft)', color: 'var(--admin-text)' }}>{message}</p>}
      {confirmReload && <div role="alert" className="mb-4 rounded-lg border p-4" style={panelStyle}><p className="text-sm">未保存の編集を破棄して、最新データを読み込みます。編集を残す場合はキャンセルしてください。</p><div className="mt-3 flex flex-wrap gap-3"><button className={buttonClass} style={fieldStyle} disabled={busy} onClick={() => setConfirmReload(false)}>編集を残す</button><button className={buttonClass} style={actionStyle} disabled={busy} onClick={() => void reload()}>編集を破棄して再読込</button></div></div>}
      {loading && <p role="status" className="mb-4 text-sm">キャラクターを読み込んでいます…</p>}
      {saved && <form onSubmit={(event) => void save(event)}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-sm"><p>{draft.length}体 · リビジョン {saved.revision}{dirty && <strong className="ml-3" style={{ color: 'var(--admin-accent)' }}>未保存の変更あり</strong>}</p><button type="submit" className={buttonClass} style={actionStyle} disabled={busy || !dirty || conflict}><Save size={16} />{saving ? '保存中…' : '変更を保存'}</button></div>
        <div className="grid items-start gap-5 lg:grid-cols-[260px_1fr]">
          <aside className="rounded-xl border p-4" style={panelStyle}>
            <h2 className="mb-3 text-base font-semibold">仲間一覧</h2>
            <div className="grid max-h-80 grid-cols-2 gap-2 overflow-y-auto lg:max-h-[70vh] lg:grid-cols-1">
              {draft.map((cat, index) => <button key={index} type="button" disabled={busy} aria-pressed={selected === index} onClick={() => setSelected(index)} className="min-h-16 rounded-lg border p-3 text-left disabled:opacity-50" style={{ background: selected === index ? 'var(--admin-accent-soft)' : 'var(--admin-surface-raised)', borderColor: selected === index ? 'var(--admin-accent)' : 'var(--admin-border)', color: 'var(--admin-text)' }}><strong className="block text-sm">{cat.name.ja || '新しい仲間'}</strong><span className="mt-1 block break-all text-xs" style={{ color: 'var(--admin-text-muted)' }}>{'★'.repeat(cat.rarity)} · {cat.id || 'ID未入力'}</span></button>)}
            </div>
            <button type="button" className={`${buttonClass} mt-4 w-full`} style={fieldStyle} disabled={busy || draft.length >= 200} onClick={() => { setSelected(draft.length); setDraft([...draft, newCharacter()]); setMessage(''); }}><Plus size={16} />仲間を追加</button>
            <p className="mt-3 text-xs leading-5" style={{ color: 'var(--admin-text-muted)' }}>最大200体。既存キャラクターの削除・ID変更はできません。★3・★4・★5をそれぞれ1体以上残してください。</p>
          </aside>
          {character && <fieldset disabled={busy} className="min-w-0 rounded-xl border p-5 sm:p-7" style={panelStyle}>
            <legend className="sr-only">選択したキャラクターの編集</legend>
            <CharacterFields character={character} saved={selected < saved.characters.length} onChange={(next) => { setDraft(draft.map((cat, index) => index === selected ? next : cat)); setMessage(''); }} />
            <p className="mt-5 text-xs leading-5" style={{ color: 'var(--admin-text-muted)' }}>能力値はLv.1・重複なしの値です。追加した仲間は同じレア度の仲間と均等な確率で召喚されます。</p>
            {selected >= saved.characters.length && <button type="button" className={`${buttonClass} mt-4`} style={fieldStyle} onClick={() => { setDraft(draft.filter((_, index) => index !== selected)); setSelected(Math.max(0, selected - 1)); }}>この未保存の追加を取り消す</button>}
          </fieldset>}
        </div>
      </form>}
    </div>
  </main>;
}

export default function CharacterCatalogAdmin() {
  const { currentUser, loading, isAdmin } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (loading) return;
    if (!currentUser) router.replace('/signin');
    else if (!isAdmin) router.replace('/');
  }, [currentUser, isAdmin, loading, router]);
  if (loading || !currentUser || !isAdmin) return <main className="p-8"><p role="status">管理者の認証を確認しています…</p></main>;
  return <CatalogEditor key={currentUser.uid} currentUser={currentUser} />;
}
