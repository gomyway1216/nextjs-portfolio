'use client';
import * as util from '@/lib/utils/util';
import { createPlainTextExcerpt } from '@/lib/text';
import type { Project } from '@/services/projectsService';
import * as projectApi from '@/services/projectsService';
import { ArrowRight } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Tab, TabList, TabPanel, Tabs } from 'react-tabs';


const tabList = ['All', 'Web App', 'Mobile', 'AI/ML', 'Console'];
type PortfolioCategory = typeof tabList[number];
type ProjectsByCategory = Record<PortfolioCategory, Project[]>;
const HOME_PROJECT_LIMIT = 4;

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

const PortfolioAnimation = () => {
  const { t } = useTranslation();
  const [projectsByCategory, setProjectsByCategory]
    = useState<ProjectsByCategory>({'All': [], 'Web App': [], 'Mobile': [], 'AI/ML': [], 'Console': []});
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const classifyProjects = async () => {
      setIsLoading(true);
      setHasError(false);

      try {
        const classified: ProjectsByCategory = {All: [], 'Web App': [], Mobile: [], 'AI/ML': [], Console: []};
        const fetchedProjects: Project[] = sortProjectsByDate(await projectApi.getProjects());

        fetchedProjects.forEach((project) => {
          classified.All.push(project);
          project.categories?.forEach((cat) => {
            if (Object.prototype.hasOwnProperty.call(classified, cat)) {
              classified[cat as PortfolioCategory].push(project);
            }
          });
        });

        if (!cancelled) setProjectsByCategory(classified);
      } catch (error) {
        console.error('[PortfolioAnimation] failed to fetch projects:', error);
        if (!cancelled) setHasError(true);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    classifyProjects();
    return () => {
      cancelled = true;
    };
  }, []);

  const renderProjects = (projects: Project[], category: string) => {
    if (isLoading) {
      return <div className="project-state">{t('home.sections.work.loading')}</div>;
    }

    if (hasError) {
      return <div className="project-state project-state--error">{t('home.sections.work.error')}</div>;
    }

    if (projects.length === 0) {
      return <div className="project-state">{t('home.sections.work.empty')}</div>;
    }

    const visibleProjects = projects.slice(0, HOME_PROJECT_LIMIT);
    const hasMoreProjects = projects.length > HOME_PROJECT_LIMIT;

    return (
      <div className="row project-grid">
        {visibleProjects.map((project, j) => {
          const technologies = project.technologies?.map(normalizeTechnology).filter(Boolean).slice(0, 4) ?? [];
          const primaryCategory = project.categories?.[0] || category;
          const excerpt = createPlainTextExcerpt(project.description, 145);

          return (
            <div
              className="col-md-6 m-15px-tb"
              data-aos="fade-right"
              key={`${category}:${project.id || j}`}
            >
              <Link
                className="project-card modern-card"
                href={`/projects/${encodeURIComponent(project.id)}`}
                aria-label={t('home.sections.work.cardLabel', { title: project.title })}
              >
                <div className="project-card__media">
                  {project.thumbImage ? (
                    <Image
                      src={project.thumbImage}
                      alt={project.title || 'Project thumbnail'}
                      fill
                      sizes="(max-width: 700px) 100vw, (max-width: 1100px) 50vw, 33vw"
                      style={{ objectFit: 'cover' }}
                    />
                  ) : (
                    <div className="project-card__placeholder" aria-hidden="true">
                      {project.title?.slice(0, 2) || 'PR'}
                    </div>
                  )}
                </div>
                <div className="project-card__body">
                  <div className="project-card__meta">
                    {primaryCategory && <span>{primaryCategory}</span>}
                    {project.date && <span>{util.formatDate(project.date)}</span>}
                  </div>
                  <h4>{project.title}</h4>
                  {excerpt && <p>{excerpt}</p>}
                  {technologies.length > 0 && (
                    <div className="project-card__tech" aria-label={t('home.sections.work.technologies')}>
                      {technologies.map((technology) => (
                        <span key={technology}>{technology}</span>
                      ))}
                    </div>
                  )}
                  <span className="project-card__cta">
                    {t('home.sections.work.cta')}
                    <ArrowRight size={16} strokeWidth={2} aria-hidden="true" />
                  </span>
                </div>
              </Link>
            </div>
          );
        })}
        {hasMoreProjects && (
          <div className="col-12">
            <Link href="/projects" className="project-view-all">
              {t('home.sections.work.viewAll')}
              <ArrowRight size={16} strokeWidth={2} aria-hidden="true" />
            </Link>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="portfolio-filter-01">
      <Tabs>
        <TabList className="filter d-flex flex-wrap justify-content-start">
          {tabList.map((val) => (
            <Tab key={val}>{val}</Tab>
          ))}
        </TabList>
        {Object.keys(projectsByCategory).map((category: string) => (
          <TabPanel key={category}>
            {renderProjects(projectsByCategory[category as PortfolioCategory], category)}
          </TabPanel>
        ))}
      </Tabs>
    </div>

  );
};

export default PortfolioAnimation;
