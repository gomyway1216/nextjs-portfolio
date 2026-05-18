'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  FileText,
  Wrench,
  CheckSquare,
} from 'lucide-react';
import { SettliIcon } from '@/components/settli';
import { KaimonoLogo } from '@/components/kaimono';
import { KuizuIcon } from '@/components/kuizu';
import { ScoreTrackerIcon } from '@/components/scoretracker';
import { useTranslation } from 'react-i18next';
import './tools-section.scss';

interface Tool {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  path: string;
  icon: React.ReactNode;
  features: string[];
  gradient: string;
}

const ToolsSection: React.FC = () => {
  const router = useRouter();
  const { t } = useTranslation();

  const tools: Tool[] = [
    {
      id: 'settli',
      title: t('home.tools.settli.title'),
      subtitle: t('home.tools.settli.subtitle'),
      description: t('home.tools.settli.description'),
      path: '/tools/settli',
      icon: <SettliIcon size={32} />,
      features: [
        t('home.tools.settli.features.optimize'),
        t('home.tools.settli.features.weighted'),
        t('home.tools.settli.features.qrShare'),
      ],
      gradient: 'linear-gradient(135deg, #2563eb, #0ea5e9, #0284c7)',
    },
    {
      id: 'kaimono',
      title: t('home.tools.kaimono.title'),
      subtitle: t('home.tools.kaimono.subtitle'),
      description: t('home.tools.kaimono.description'),
      path: '/tools/kaimono',
      icon: <KaimonoLogo size={32} variant="mono" />,
      features: [
        t('home.tools.kaimono.features.budget'),
        t('home.tools.kaimono.features.recurring'),
        t('home.tools.kaimono.features.share'),
      ],
      gradient: 'linear-gradient(135deg, #059669, #10b981, #34d399)',
    },
    {
      id: 'kuizu',
      title: t('home.tools.kuizu.title'),
      subtitle: t('home.tools.kuizu.subtitle'),
      description: t('home.tools.kuizu.description'),
      path: '/tools/kuizu',
      icon: <KuizuIcon size={32} />,
      features: [
        t('home.tools.kuizu.features.multiplayer'),
        t('home.tools.kuizu.features.daily'),
        t('home.tools.kuizu.features.custom'),
      ],
      gradient: 'linear-gradient(135deg, #d97706, #f59e0b, #fbbf24)',
    },
    {
      id: 'markdownPreview',
      title: t('home.tools.markdownPreview.title'),
      subtitle: t('home.tools.markdownPreview.subtitle'),
      description: t('home.tools.markdownPreview.description'),
      path: '/tools/markdown-preview',
      icon: <FileText size={32} />,
      features: [
        t('home.tools.markdownPreview.features.dragDrop'),
        t('home.tools.markdownPreview.features.clipboard'),
        t('home.tools.markdownPreview.features.gfm'),
      ],
      gradient: 'linear-gradient(135deg, #7c3aed, #8b5cf6, #a78bfa)',
    },
    {
      id: 'todo',
      title: 'Todo',
      subtitle: 'AI Task Manager',
      description: 'Extract tasks from screenshots or text with AI. Manage your todo list with smart input.',
      path: '/tools/todo',
      icon: <CheckSquare size={32} />,
      features: [
        'Screenshot to tasks',
        'Text extraction',
        'AI-powered',
      ],
      gradient: 'linear-gradient(135deg, #dc2626, #ef4444, #f87171)',
    },
    {
      id: 'scoreTracker',
      title: 'スコアトラッカー',
      subtitle: 'Score Tracker',
      description: '麻雀の素点、ゴルフ、ボドゲ会など — 日付ごとの最終点を記録して累計を追跡。コードで友達と共有できます。',
      path: '/tools/score-tracker',
      icon: <ScoreTrackerIcon size={32} />,
      features: [
        '日次スコア記録',
        '累計の自動集計',
        'コード共有',
      ],
      gradient: 'linear-gradient(135deg, #0f766e, #14b8a6, #2dd4bf)',
    },
  ];

  const handleToolClick = (path: string) => {
    router.push(path);
  };

  return (
    <div className="tools-section">
      <div className="tools-grid">
        {tools.map((tool) => (
          <div
            key={tool.id}
            className="tool-card tool-card--featured modern-card"
            onClick={() => handleToolClick(tool.path)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                handleToolClick(tool.path);
              }
            }}
            role="button"
            tabIndex={0}
            data-aos="fade-up"
            data-aos-duration="1200"
          >
            <div className="tool-card__icon" style={{ background: tool.gradient }}>
              {tool.icon}
            </div>
            <div className="tool-card__content">
              <h4 className="tool-card__title">
                {tool.title}
                <span className="tool-card__subtitle">{tool.subtitle}</span>
              </h4>
              <p className="tool-card__description">{tool.description}</p>
              <div className="tool-card__features">
                {tool.features.map((feature, index) => (
                  <span key={index} className="tool-card__feature">
                    {feature}
                  </span>
                ))}
              </div>
            </div>
            <div className="tool-card__arrow">
              <ArrowRight size={20} />
            </div>
          </div>
        ))}

        {/* Coming Soon Card */}
        <div
          className="tool-card tool-card--coming-soon modern-card"
          data-aos="fade-up"
          data-aos-duration="1200"
          data-aos-delay="100"
        >
          <div className="tool-card__icon tool-card__icon--muted">
            <Wrench size={32} />
          </div>
          <div className="tool-card__content">
            <h4 className="tool-card__title">{t('home.tools.comingSoon.title')}</h4>
            <p className="tool-card__description">{t('home.tools.comingSoon.description')}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ToolsSection;
