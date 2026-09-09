'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/providers/AuthProvider';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { StudyArticle } from '@/types/study';
import { LEARNING_DOMAINS, LearningDomain, learningLabels } from '@/lib/learningLibrary';
import { articleLearningInput, articleLearningMaterial } from '@/lib/articleLearning';
import LearningConversation from './LearningConversation';

export default function SaveArticleLearning({ article }: { article: StudyArticle; onClose?: () => void }) {
  const { currentUser, isAdmin } = useAuth();
  const { i18n } = useTranslation();
  const ja = i18n.language.startsWith('ja');
  const [section, setSection] = useState('summary');
  const [domain, setDomain] = useState<LearningDomain>('engineering');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  if (!currentUser || !isAdmin) return null;
  async function save() {
    if (!currentUser || busy) return;
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/study/library', {
        method: 'POST', headers: { Authorization: `Bearer ${await currentUser.getIdToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save', input: articleLearningInput(article, section, domain) }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Unable to save');
      setSaved(true);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to save'); }
    finally { setBusy(false); }
  }
  return <section className="space-y-3 rounded-lg border bg-card p-4">
    <h3 className="font-medium">{ja ? '覚えておきたい部分を残す' : 'Keep the part worth revisiting'}</h3>
    <p className="text-sm text-muted-foreground">{ja ? '元の説明・図・出典を非公開で保存します。有料AI生成は行いません。' : 'Save the original explanation, diagrams and source privately. No paid AI generation.'}</p>
    <Select value={section} onValueChange={(v) => { setSection(v); setSaved(false); }}><SelectTrigger aria-label={ja ? '保存する部分' : 'Section to save'}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="summary">{ja ? '要点' : 'Key takeaways'}</SelectItem>{article.sections.map((s) => <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>)}</SelectContent></Select>
    <Select value={domain} onValueChange={(v) => { setDomain(v as LearningDomain); setSaved(false); }}><SelectTrigger aria-label={ja ? '分野' : 'Domain'}><SelectValue /></SelectTrigger><SelectContent>{LEARNING_DOMAINS.map((d) => <SelectItem key={d} value={d}>{learningLabels[ja ? 'ja' : 'en'].domains[d]}</SelectItem>)}</SelectContent></Select>
    <LearningConversation key={section} material={articleLearningMaterial(article, section, domain)} />
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    {saved ? <p role="status">{ja ? '非公開で保存しました。' : 'Saved privately.'} <Link href="/study/learning" className="underline">{ja ? 'ライブラリを開く' : 'Open library'}</Link></p> : <Button disabled={busy} onClick={() => void save()}>{ja ? busy ? '保存中…' : 'この部分を保存' : busy ? 'Saving…' : 'Save this section'}</Button>}
  </section>;
}
