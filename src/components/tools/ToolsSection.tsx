'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Wrench,
} from 'lucide-react';
import { SettliIcon } from '@/components/settli';
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

const tools: Tool[] = [
  {
    id: 'settli',
    title: 'Settli',
    subtitle: 'セトリ',
    description: 'グループの精算を、スマートに。複雑な割り勘も最適な方法を自動計算。',
    path: '/tools/settli',
    icon: <SettliIcon size={32} />,
    features: ['最適精算', '傾斜配分', 'QR共有'],
    gradient: 'linear-gradient(135deg, #6366f1, #8b5cf6, #a855f7)',
  },
  // Future tools can be added here
];

const ToolsSection: React.FC = () => {
  const router = useRouter();

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
            <h4 className="tool-card__title">Coming Soon...</h4>
            <p className="tool-card__description">新しい便利ツールを準備中です。お楽しみに！</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ToolsSection;
