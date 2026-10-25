import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CHARACTERS } from '@/components/game/StarcatCaravan/data';

const { auth, replace } = vi.hoisted(() => ({ auth: vi.fn(), replace: vi.fn() }));
vi.mock('@/providers/AuthProvider', () => ({ useAuth: auth }));
vi.mock('@/lib/firebaseConnect', () => ({ auth: { currentUser: null } }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));

import CharacterCatalogAdmin, { CharacterFields, readCatalogResponse } from '@/components/game/StarcatCaravan/CharacterCatalogAdmin';

describe('character administration access and form', () => {
  it.each([
    { loading: true, currentUser: null, isAdmin: false },
    { loading: false, currentUser: null, isAdmin: false },
    { loading: false, currentUser: { uid: 'player' }, isAdmin: false },
  ])('does not show editing controls until administrator access is established: %o', (session) => {
    auth.mockReturnValue(session);
    const html = renderToStaticMarkup(<CharacterCatalogAdmin />);
    expect(html).toContain('管理者の認証を確認');
    expect(html).not.toContain('変更を保存');
    expect(html).not.toContain('仲間を追加');
    expect(html).not.toContain('キャラクターID');
  });

  it('shows the administrator a loading state instead of making an empty catalog editable', () => {
    auth.mockReturnValue({ loading: false, currentUser: { uid: 'owner', getIdToken: vi.fn() }, isAdmin: true });
    const html = renderToStaticMarkup(<CharacterCatalogAdmin />);
    expect(html).toContain('キャラクターを読み込んでいます');
    expect(html).toContain('星ねこキャラバン · キャラクター管理');
    expect(html).not.toContain('変更を保存');
  });

  it('locks a saved ID while labeling both languages and every editable gameplay field', () => {
    const html = renderToStaticMarkup(<CharacterFields character={CHARACTERS[0]} saved onChange={vi.fn()} />);
    const idInput = html.match(/<input[^>]*aria-describedby="starcat-id-help"[^>]*>/)?.[0];
    expect(idInput).toContain('disabled=""');
    expect(idInput).toContain('value="ember"');
    for (const label of ['名前（日本語）', '名前（English）', '肩書き（日本語）', '肩書き（English）', 'レア度', '属性', '役割', '毛色', '衣装・アクセント色', 'HP', '攻撃・回復力', '射程']) expect(html).toContain(label);
    expect(html).not.toContain('出撃エネルギー');
    expect(html).not.toContain('再出撃までの秒数');
    expect(html.match(/type="number"/g)).toHaveLength(4);
    expect(html).toContain('max="500"');
    expect(html).not.toContain('削除');
  });

  it('leaves an unsaved ID editable so a duplicate ID can still be corrected', () => {
    const html = renderToStaticMarkup(<CharacterFields character={CHARACTERS[0]} saved={false} onChange={vi.fn()} />);
    const idInput = html.match(/<input[^>]*aria-describedby="starcat-id-help"[^>]*>/)?.[0];
    expect(idInput).toBeDefined();
    expect(idInput).not.toContain('disabled=""');
    expect(idInput).toContain('maxLength="48"');
  });
});

describe('catalog response failures', () => {
  it.each(['load', 'save'] as const)('keeps a JSON API error readable during %s', async (operation) => {
    await expect(readCatalogResponse(new Response(JSON.stringify({ error: '管理者としてログインしてください。' }), { status: 403 }), operation)).rejects.toThrow('管理者としてログインしてください。');
  });

  it.each([
    [502, '<html>Bad Gateway</html>'],
    [504, 'Gateway Timeout'],
    [500, 'null'],
    [503, '{"error":null}'],
    [400, '{"error":""}'],
  ] as const)('uses friendly load/save messages for HTTP %s with body %s', async (status, body) => {
    await expect(readCatalogResponse(new Response(body, { status }), 'load')).rejects.toThrow('キャラクターを読み込めませんでした。時間をおいて再試行してください。');
    await expect(readCatalogResponse(new Response(body, { status }), 'save')).rejects.toThrow('保存できませんでした。編集中の内容は残っています。時間をおいて再試行してください。');
  });

  it.each(['<html>Unavailable</html>', 'null', '{', '{}'])('does not accept a malformed successful response: %s', async (body) => {
    await expect(readCatalogResponse(new Response(body, { status: 200 }), 'load')).rejects.toThrow('キャラクターデータの形式を確認できませんでした。');
    await expect(readCatalogResponse(new Response(body, { status: 200 }), 'save')).rejects.toThrow('保存結果を確認できませんでした。編集中の内容を控えてから再読込してください。');
  });

  it('accepts a valid catalog response', async () => {
    const catalog = { revision: 7, characters: CHARACTERS };
    await expect(readCatalogResponse(new Response(JSON.stringify(catalog)), 'save')).resolves.toEqual(catalog);
  });
});
