'use client';

import { useTranslation } from 'react-i18next';
import type { LearningItem } from '@/lib/learningLibrary';
import LearningConversation from './LearningConversation';

export function learningAngles(item: Pick<LearningItem, 'domains'>, ja: boolean): string[] {
  if (item.domains.includes('english')) return ja
    ? ['この表現、どんな会話で自然に使う？', '似た表現に言い換えると、何が変わる？']
    : ['Where would this sound natural in a conversation?', 'How does a similar expression change the nuance?'];
  if (item.domains.includes('finance') || item.domains.includes('society')) return ja
    ? ['身近な出来事を、この仕組みで説明すると？', '条件を一つ変えると、誰にどんな影響がある？']
    : ['What everyday event does this explain?', 'If one condition changes, who is affected and how?'];
  return ja ? ['これが使われる具体的な場面を見たい', '条件を一つ変えると、何が起きる？']
    : ['Show me a concrete situation where this is used', 'What happens if we change one condition?'];
}

export default function LearningRediscovery({ item }: { item: LearningItem }) {
  const { i18n } = useTranslation();
  const ja = i18n.language.startsWith('ja');
  const material = { title: item.title, content: item.content, domains: item.domains, itemId: item.id, revision: item.revision, sources: item.sources, diagrams: item.diagrams, figures: item.figures };
  return <section className="space-y-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
    <h3 className="font-medium">{ja ? '覚える前に、ちょっと遊んでみる？' : 'Explore it before memorizing it?'}</h3>
    <p className="text-sm text-muted-foreground">{ja ? '元の説明と図は下にあります。気になったら、問いを選んで普段のAIへ。選ぶだけでは送信・保存・復習設定はしません。' : 'The original explanation and diagrams are below. Pick a question to take to your AI if you want. Choosing does not send, save or schedule a review.'}</p>
    <div className="flex flex-wrap gap-2">{learningAngles(item, ja).map((question) => <LearningConversation key={question} material={material} initialMode="explore" initialQuestion={question} label={question} />)}</div>
    <p className="text-xs text-muted-foreground">{ja ? '読むだけでも、今日はここまででもOK。' : 'Just reading—or stopping here—is fine too.'}</p>
  </section>;
}
