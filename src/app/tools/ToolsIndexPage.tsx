'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowRight,
  CheckSquare,
  FileText,
  Train,
} from 'lucide-react';
import PageIntro from '@/components/common/PageIntro';
import { KaimonoLogo } from '@/components/kaimono';
import { KuizuIcon } from '@/components/kuizu';
import { ScoreTrackerIcon } from '@/components/scoretracker';
import { SettliIcon } from '@/components/settli';
import styles from './tools-index.module.css';

interface ToolCard {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  href: string;
  accent: string;
  icon: ReactNode;
  features: string[];
}

const toolAccent = (accent: string) => ({ '--tool-card-accent': accent } as CSSProperties);

export default function ToolsIndexPage() {
  const { t } = useTranslation();

  const tools = useMemo<ToolCard[]>(() => [
    {
      id: 'settli',
      title: t('home.tools.settli.title'),
      subtitle: t('home.tools.settli.subtitle'),
      description: t('home.tools.settli.description'),
      href: '/tools/settli',
      accent: '#6366f1',
      icon: <SettliIcon size={30} />,
      features: [
        t('home.tools.settli.features.optimize'),
        t('home.tools.settli.features.weighted'),
        t('home.tools.settli.features.qrShare'),
      ],
    },
    {
      id: 'kaimono',
      title: t('home.tools.kaimono.title'),
      subtitle: t('home.tools.kaimono.subtitle'),
      description: t('home.tools.kaimono.description'),
      href: '/tools/kaimono',
      accent: '#10b981',
      icon: <KaimonoLogo size={30} variant="mono" />,
      features: [
        t('home.tools.kaimono.features.budget'),
        t('home.tools.kaimono.features.recurring'),
        t('home.tools.kaimono.features.share'),
      ],
    },
    {
      id: 'kuizu',
      title: t('home.tools.kuizu.title'),
      subtitle: t('home.tools.kuizu.subtitle'),
      description: t('home.tools.kuizu.description'),
      href: '/tools/kuizu',
      accent: '#f97316',
      icon: <KuizuIcon size={30} />,
      features: [
        t('home.tools.kuizu.features.multiplayer'),
        t('home.tools.kuizu.features.daily'),
        t('home.tools.kuizu.features.custom'),
      ],
    },
    {
      id: 'score-tracker',
      title: t('toolsPage.scoreTracker.title'),
      subtitle: t('toolsPage.scoreTracker.subtitle'),
      description: t('toolsPage.scoreTracker.description'),
      href: '/tools/score-tracker',
      accent: '#0f766e',
      icon: <ScoreTrackerIcon size={30} />,
      features: [
        t('toolsPage.scoreTracker.features.daily'),
        t('toolsPage.scoreTracker.features.total'),
        t('toolsPage.scoreTracker.features.share'),
      ],
    },
    {
      id: 'markdown-preview',
      title: t('home.tools.markdownPreview.title'),
      subtitle: t('home.tools.markdownPreview.subtitle'),
      description: t('home.tools.markdownPreview.description'),
      href: '/tools/markdown-preview',
      accent: '#2563eb',
      icon: <FileText size={30} strokeWidth={2} />,
      features: [
        t('home.tools.markdownPreview.features.dragDrop'),
        t('home.tools.markdownPreview.features.clipboard'),
        t('home.tools.markdownPreview.features.gfm'),
      ],
    },
    {
      id: 'railway-planner',
      title: t('home.tools.railwayPlanner.title'),
      subtitle: t('home.tools.railwayPlanner.subtitle'),
      description: t('home.tools.railwayPlanner.description'),
      href: '/tools/railway-planner',
      accent: '#0ea5e9',
      icon: <Train size={30} strokeWidth={2} />,
      features: [
        t('home.tools.railwayPlanner.features.mapEdit'),
        t('home.tools.railwayPlanner.features.serviceTypes'),
        t('home.tools.railwayPlanner.features.simulation'),
      ],
    },
    {
      id: 'todo',
      title: t('toolsPage.todo.title'),
      subtitle: t('toolsPage.todo.subtitle'),
      description: t('toolsPage.todo.description'),
      href: '/tools/todo',
      accent: '#7c3aed',
      icon: <CheckSquare size={30} strokeWidth={2} />,
      features: [
        t('toolsPage.todo.features.screenshot'),
        t('toolsPage.todo.features.text'),
        t('toolsPage.todo.features.groups'),
      ],
    },
  ], [t]);

  return (
    <main className={styles.page}>
      <section className={styles.shell}>
        <PageIntro
          kicker={t('toolsPage.kicker')}
          title={t('toolsPage.title')}
          subtitle={t('toolsPage.subtitle')}
          accent="#2563eb"
          meta={(
            <div className={styles.stats} aria-label={t('toolsPage.statsLabel')}>
              <span>{t('toolsPage.toolCount', { count: tools.length })}</span>
              <span>{t('toolsPage.workflowCount', { count: tools.length })}</span>
            </div>
          )}
        />

        <div className={styles.grid}>
          {tools.map((tool) => (
            <Link
              key={tool.id}
              href={tool.href}
              className={styles.card}
              style={toolAccent(tool.accent)}
              aria-label={t('toolsPage.openTool', { title: tool.title })}
            >
              <div className={styles.cardIcon} aria-hidden="true">
                {tool.icon}
              </div>
              <div className={styles.cardBody}>
                <div className={styles.cardHeader}>
                  <h2>{tool.title}</h2>
                  <span>{tool.subtitle}</span>
                </div>
                <p>{tool.description}</p>
                <div className={styles.features}>
                  {tool.features.map((feature) => (
                    <span key={feature}>{feature}</span>
                  ))}
                </div>
                <span className={styles.cardCta}>
                  {t('toolsPage.open')}
                  <ArrowRight size={16} strokeWidth={2} aria-hidden="true" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
