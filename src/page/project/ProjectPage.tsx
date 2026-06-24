'use client';

import RichContentRenderer from '@/components/common/RichContentRenderer';
import SimpleCarousel from '@/components/portfolio/SimpleCarousel';
import { Button } from '@/components/ui/button';
import { createPlainTextExcerpt } from '@/lib/text';
import * as util from '@/lib/utils/util';
import { useAuth } from '@/providers/AuthProvider';
import type { Project, TechnologyData } from '@/services/projectsService';
import * as projectApi from '@/services/projectsService';
import { ArrowLeft, Edit3, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './project-page.module.css';

interface ProjectPageProps {
  projectId: string;
}

function normalizeTechnology(technology: string | TechnologyData | null | undefined): TechnologyData {
  if (!technology) {
    return { id: '', name: '', type: '' };
  }

  return typeof technology === 'string'
    ? { id: technology, name: technology, type: '' }
    : technology;
}

function ProjectFact({ label, value }: { label: string; value: string }) {
  if (!value) return null;

  return (
    <div className={styles.fact}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export default function ProjectPage({ projectId }: ProjectPageProps) {
  const [project, setProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { currentUser } = useAuth();
  const router = useRouter();
  const { t } = useTranslation();

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!projectId) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        const fetchedProject = await projectApi.getProject(projectId);
        if (!cancelled) setProject(fetchedProject);
      } catch (error) {
        console.error('[ProjectPage] failed to load project:', error);
        if (!cancelled) {
          setProject(null);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const technologies = useMemo(
    () => project?.technologies?.map(normalizeTechnology).filter((tech) => tech?.name) ?? [],
    [project],
  );

  const urls = useMemo(
    () => project?.urls?.filter((url) => url?.link) ?? [],
    [project],
  );

  const categories = project?.categories?.filter(Boolean) ?? [];
  const summary = createPlainTextExcerpt(project?.description, 220);
  const hasImages = Boolean(project?.thumbImage || project?.images?.length);

  const handleEdit = () => {
    router.push(`/projects/${projectId}/edit`);
  };

  if (isLoading) {
    return (
      <main className={styles.page}>
        <div className={styles.shell}>
          <div className={styles.statusPanel}>
            <span className={styles.statusDot} aria-hidden="true" />
            {t('projectPage.loading')}
          </div>
        </div>
      </main>
    );
  }

  if (!project) {
    return (
      <main className={styles.page}>
        <div className={styles.shell}>
          <div className={styles.statusPanel}>
            <h1>{t('projectPage.notFoundTitle')}</h1>
            <p>{t('projectPage.notFoundText')}</p>
            <Link href="/#work" className={styles.backLink}>
              <ArrowLeft aria-hidden="true" size={16} strokeWidth={2} />
              {t('projectPage.backToWork')}
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <div className={styles.toolbar}>
          <Link href="/#work" className={styles.backLink}>
            <ArrowLeft aria-hidden="true" size={16} strokeWidth={2} />
            {t('projectPage.backToWork')}
          </Link>
          {currentUser && (
            <Button onClick={handleEdit} className={styles.editButton}>
              <Edit3 aria-hidden="true" size={15} strokeWidth={2} />
              {t('projectPage.edit')}
            </Button>
          )}
        </div>

        <header className={styles.hero}>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>{t('projectPage.eyebrow')}</p>
            <h1>{project.title}</h1>
            {summary && <p className={styles.summary}>{summary}</p>}
            {categories.length > 0 && (
              <div className={styles.categoryList} aria-label={t('projectPage.categories')}>
                {categories.map((category) => (
                  <span key={category}>{category}</span>
                ))}
              </div>
            )}
          </div>

          <div className={styles.mediaPanel}>
            {hasImages ? (
              <SimpleCarousel
                images={project.images || []}
                thumbImage={project.thumbImage || ''}
              />
            ) : (
              <div className={styles.placeholderMedia} aria-hidden="true">
                {(project.title || 'PR').slice(0, 2)}
              </div>
            )}
          </div>
        </header>

        <dl className={styles.factGrid}>
          <ProjectFact label={t('projectPage.client')} value={project.client || t('projectPage.fallbackClient')} />
          <ProjectFact label={t('projectPage.industry')} value={project.industry || ''} />
          <ProjectFact label={t('projectPage.date')} value={util.formatDate(project.date)} />
          <ProjectFact label={t('projectPage.categories')} value={categories.join(', ')} />
        </dl>

        <div className={styles.contentGrid}>
          <article className={styles.article}>
            <h2>{t('projectPage.overview')}</h2>
            <RichContentRenderer content={project.description || ''} className={styles.prose} />
          </article>

          <aside className={styles.sidebar} aria-label={t('projectPage.details')}>
            {technologies.length > 0 && (
              <section className={styles.sideSection}>
                <h2>{t('projectPage.stack')}</h2>
                <div className={styles.techList}>
                  {technologies.map((technology) => (
                    <span key={technology.id || technology.name}>{technology.name}</span>
                  ))}
                </div>
              </section>
            )}

            {urls.length > 0 && (
              <section className={styles.sideSection}>
                <h2>{t('projectPage.links')}</h2>
                <div className={styles.linkList}>
                  {urls.map((url) => (
                    <a
                      href={url.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      key={`${url.type || url.name}:${url.link}`}
                    >
                      <span>{url.name || url.type || t('projectPage.viewProject')}</span>
                      <ExternalLink aria-hidden="true" size={15} strokeWidth={2} />
                    </a>
                  ))}
                </div>
              </section>
            )}
          </aside>
        </div>
      </div>
    </main>
  );
}
