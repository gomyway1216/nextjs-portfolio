'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useAuth } from '@/providers/AuthProvider';
import { useStudyArticle } from '@/hooks/useStudy';

const StudyAdminPanel = dynamic(() => import('@/components/study/StudyAdminPanel'), {
  loading: () => <p role="status">編集画面を読み込み中…</p>,
});

/** Reuse the authenticated admin editor; opening this route never writes an article. */
export default function StudyArticleEditPage() {
  const { id } = useParams<{ id: string }>();
  const { currentUser, isAdmin, loading: authLoading } = useAuth();
  const allowed = !authLoading && Boolean(currentUser) && isAdmin;
  const { article, loading, error, fetchArticle } = useStudyArticle(id, {
    ready: allowed, userId: allowed ? currentUser!.uid : null, isAdmin: allowed, forEdit: true,
  });

  return <main className="mx-auto max-w-6xl p-4 sm:p-8">
    <Link href={`/study/articles/${encodeURIComponent(id)}`} className="text-blue-600 underline">記事へ戻る</Link>
    <h1 className="my-4 text-2xl font-semibold">記事の設定を編集</h1>
    {authLoading ? <p role="status">ログインを確認中…</p>
      : !allowed ? <p>管理者として<Link href="/admin" className="text-blue-600 underline">ログイン</Link>してください。</p>
      : loading ? <p role="status">記事を読み込み中…</p>
      : error || !article ? <div role="alert"><p>記事を読み込めませんでした。</p><button onClick={() => void fetchArticle()}>再試行</button></div>
      : <>
        <p className="mb-4 text-sm text-slate-500">タイトル・要約・公開設定を編集できます。本文・図・クイズはこの画面では変更しません。</p>
        <StudyAdminPanel key={article.id} initialArticle={article} />
      </>}
  </main>;
}
