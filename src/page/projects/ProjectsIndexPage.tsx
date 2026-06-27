'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { createPlainTextExcerpt } from '@/lib/text';
import * as util from '@/lib/utils/util';
import type { Project } from '@/services/projectsService';
import * as projectApi from '@/services/projectsService';
import styles from './projects-index.module.css';

const categories = ['All', 'Web App', 'Mobile', 'AI/ML', 'Console'] as const;
type ProjectCategory = typeof categories[number];

function normalizeTechnology(technology: Project['technologies'][number] | null | undefined): string {
  if (!technology) return '';
  return typeof technology === 'string' ? technology : technology.name || '';
}

function sortProjectsByDate(projects: Project[]): Project[] {
  return [...projects].sort((a, b) => {
    const aTime = new Date(a.date).getTime();
    const bTime = new Date(b.date).getTime();
    return (Number.isNaN(bTime) ? 0 : bTime) - (Number.isNaN(aTime) ? 0 : aTime);
  });
}

function matchesCategory(project: Project, category: ProjectCategory): boolean {
  if (category === 'All') return true;
  return project.categories?.includes(category) ?? false;
}

export default function ProjectsIndexPage() {
  const { t } = useTranslation();
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeCategory, setActiveCategory] = useState<ProjectCategory>('All');
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const fetchProjects = async () => {
      setIsLoading(true);
      setHasError(false);

      try {
        const fetchedProjects = sortProjectsByDate(await projectApi.getProjects());
        if (!cancelled) setProjects(fetchedProjects);
      } catch (error) {
        console.error('[ProjectsIndexPage] failed to fetch projects:', error);
        if (!cancelled) setHasError(true);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    fetchProjects();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredProjects = useMemo(
    () => projects.filter((project) => matchesCategory(project, activeCategory)),
    [activeCategory, projects],
  );

  const categoryCount = categories.filter(
    (category) => category !== 'All' && projects.some((project) => matchesCategory(project, category)),
  ).length;

  return (
    <main className={styles.page}>
      <section className={styles.shell}>
        <header className={styles.hero}>
          <p className={styles.kicker}>{t('projectsPage.kicker')}</p>
          <h1 className={styles.title}>{t('projectsPage.title')}</h1>
          <p className={styles.subtitle}>{t('projectsPage.subtitle')}</p>
          <div className={styles.stats} aria-label={t('projectsPage.statsLabel')}>
            <span>{t('projectsPage.projectCount', { value: projects.length })}</span>
            <span>{t('projectsPage.categoryCount', { value: categoryCount })}</span>
          </div>
        </header>

        <div className={styles.filterBar} aria-label={t('projectsPage.filterLabel')}>
          {categories.map((category) => {
            const isActive = activeCategory === category;
            return (
              <button
                type="button"
                key={category}
                className={isActive ? `${styles.filterButton} ${styles.filterButtonActive}` : styles.filterButton}
                onClick={() => setActiveCategory(category)}
              >
                {category === 'All' ? t('projectsPage.all') : category}
              </button>
            );
          })}
        </div>

        {isLoading ? (
          <div className={styles.statusPanel} role="status">
            <span className={styles.statusDot} aria-hidden="true" />
            {t('projectsPage.loading')}
          </div>
        ) : null}

        {!isLoading && hasError ? (
          <div className={`${styles.statusPanel} ${styles.errorPanel}`} role="status">
            {t('projectsPage.error')}
          </div>
        ) : null}

        {!isLoading && !hasError && filteredProjects.length === 0 ? (
          <div className={styles.emptyPanel} role="status">
            <h2>{t('projectsPage.emptyTitle')}</h2>
            <p>{t('projectsPage.emptyText')}</p>
          </div>
        ) : null}

        {!isLoading && !hasError && filteredProjects.length > 0 ? (
          <div className={styles.grid}>
            {filteredProjects.map((project) => {
              const technologies = project.technologies?.map(normalizeTechnology).filter(Boolean).slice(0, 4) ?? [];
              const primaryCategory = project.categories?.[0] || t('projectsPage.all');
              const excerpt = createPlainTextExcerpt(project.description, 165);

              return (
                <Link
                  className={styles.card}
                  href={`/projects/${encodeURIComponent(project.id)}`}
                  key={project.id}
                  aria-label={t('projectsPage.cardLabel', { title: project.title })}
                >
                  <div className={styles.media}>
                    {project.thumbImage ? (
                      <Image
                        src={project.thumbImage}
                        alt={project.title || 'Project thumbnail'}
                        fill
                        sizes="(max-width: 700px) 100vw, (max-width: 1100px) 50vw, 33vw"
                        style={{ objectFit: 'cover' }}
                      />
                    ) : (
                      <div className={styles.placeholder} aria-hidden="true">
                        {project.title?.slice(0, 2) || 'PR'}
                      </div>
                    )}
                  </div>
                  <div className={styles.cardBody}>
                    <div className={styles.meta}>
                      {primaryCategory && <span>{primaryCategory}</span>}
                      {project.date && <span>{util.formatDate(project.date)}</span>}
                    </div>
                    <h2>{project.title}</h2>
                    {excerpt && <p>{excerpt}</p>}
                    {technologies.length > 0 && (
                      <div className={styles.techList} aria-label={t('projectsPage.technologies')}>
                        {technologies.map((technology) => (
                          <span key={technology}>{technology}</span>
                        ))}
                      </div>
                    )}
                    <span className={styles.cardCta}>
                      {t('projectsPage.cta')}
                      <ArrowRight size={16} strokeWidth={2} aria-hidden="true" />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : null}
      </section>
    </main>
  );
}
