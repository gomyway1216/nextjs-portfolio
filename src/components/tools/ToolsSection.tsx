'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Wrench,
} from 'lucide-react';
import { SettliIcon } from '@/components/settli';
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
