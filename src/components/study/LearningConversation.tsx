'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, MessageCircle, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { learningArticleReference, learningConversationPrompt, type LearningMaterial, type LearningMode } from '@/lib/learningConversation';

export default function LearningConversation({ material }: { material: LearningMaterial }) {
  const { i18n } = useTranslation();
  const ja = i18n.language.startsWith('ja');
  const say = (j: string, e: string) => ja ? j : e;
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<LearningMode>('explain');
  const [question, setQuestion] = useState('');
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const prompt = learningConversationPrompt(material, mode, question, ja);
  const article = learningArticleReference(material);
  async function copy() {
    try { await navigator.clipboard.writeText(prompt); setCopied(true); setFailed(false); }
    catch { setFailed(true); setCopied(false); }
  }
  return <>
    <Button variant="outline" onClick={() => { setOpen(true); setCopied(false); setFailed(false); }}><MessageCircle size={18} />{say('AIと理解を深める', 'Learn through conversation')}</Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader><DialogTitle>{say('分からないままにしない', 'Pick up where you got stuck')}</DialogTitle><DialogDescription>{say('説明・元の図・出典をまとめて、普段のCodexやClaudeへ。ここではAIの実行や自動送信はしません。', 'Take the explanation, original diagrams and sources to your usual Codex or Claude conversation. No AI calls or automatic sending here.')}</DialogDescription></DialogHeader>
      <p className="font-medium">{material.title}</p>
      {article && <p className="break-words text-sm text-muted-foreground">{say('記事IDを付け、接続済みMCPから本文を読むようAIに伝えます。', 'Includes the article ID and asks your AI to read the full body through its connected MCP.')}<br /><span className="font-mono">{article.id}</span>{article.sectionId && <><br />{say('節', 'Section')}: <span className="font-mono">{article.sectionId}</span></>}</p>}
      <Tabs value={mode} onValueChange={(value) => { setMode(value as LearningMode); setCopied(false); }}><TabsList className="flex h-auto flex-wrap"><TabsTrigger value="explain">{say('説明してもらう', 'Explain it')}</TabsTrigger><TabsTrigger value="explore">{say('「なぜ？」から楽しむ', 'Explore a why')}</TabsTrigger><TabsTrigger value="practice">{say('一問ずつ練習', 'Practice one question')}</TabsTrigger></TabsList></Tabs>
      <label className="space-y-2"><span>{say('どこが気になる？（任意）', 'What would you like to explore? (optional)')}</span><Textarea value={question} maxLength={2000} onChange={(e) => { setQuestion(e.target.value); setCopied(false); }} placeholder={say('例：この考え方は実際のサービスでどう使う？', 'For example: how is this used in a real service?')} /></label>
      <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground"><li>{say('下の内容を確認してコピー', 'Review and copy the prompt below')}</li><li>{say('普段のAIの会話に貼り付けて送信', 'Paste it into your usual AI conversation')}</li><li>{say('役立った補足は、元の学びと関連付けて保存を頼む', 'Ask to save a useful follow-up linked to this learning')}</li></ol>
      <details><summary className="cursor-pointer text-sm underline">{say('送る内容を確認・手動でコピー', 'Inspect or manually copy the prompt')}</summary><Textarea aria-label={say('AIへ渡す内容', 'Prompt for AI')} className="mt-3 font-mono text-sm" rows={10} readOnly value={prompt} /></details>
      <Button onClick={() => void copy()}>{copied ? <Check size={18} /> : <Copy size={18} />}{say(copied ? 'コピーしました' : '質問と教材をコピー', copied ? 'Copied' : 'Copy question and material')}</Button>
      {(failed || copied) && <p role="status" className="text-sm">{failed ? say('コピーできませんでした。「送る内容を確認」を開いて手動でコピーしてください。', 'Clipboard unavailable. Open the prompt above and copy it manually.') : say('AIへ貼り付けてください。この操作では保存・自己評価は変更していません。', 'Paste it into your AI. Copying has not changed saved content or self-assessments.')}</p>}
    </DialogContent></Dialog>
  </>;
}
