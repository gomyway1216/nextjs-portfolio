'use client';
import React from 'react';
import { useAuth } from '@/providers/AuthProvider';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import * as util from '@/lib/utils/util';
import DOMPurify from 'dompurify';
import SimpleCarousel from './SimpleCarousel';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';

interface PortfolioModalProps {
  project: {
    id: string;
    title: string;
    description: string;
    images?: string[];
    thumbImage: string;
    client: string;
    technologies: Array<{
      name: string;
      type: 'language' | 'framework' | string;
    }>;
    industry: string;
    date: Date;
    urls: Array<{
      name: string;
      link: string;
      type: 'GitHub' | 'Website' | string;
    }>;
  };
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

const PortfolioModal = ({ project, isOpen, setIsOpen }: PortfolioModalProps) => {
  const { currentUser } = useAuth();
  const router = useRouter();

  const purifiedDescription = project ? DOMPurify.sanitize(project.description, {
    ADD_TAGS: ['iframe'],
    ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'scrolling']
  }) : '';

  const closeModal = () => {
    setIsOpen(false);
  };

  const handleEdit = () => {
    if (project) {
      router.push(`/project/${project.id}/edit`);
    }
  };

  return (
    <Dialog open={isOpen && !!project} onOpenChange={(open) => setIsOpen(open)}>
      <DialogContent className="max-w-[90vw] md:max-w-[1000px] max-h-[90vh] overflow-y-auto">
        <DialogTitle className="sr-only">{project?.title || 'Project Details'}</DialogTitle>
        {currentUser && (
          <Button onClick={handleEdit} className="mb-4">
            EDIT
          </Button>
        )}

        {project && (
          <div className="scrollable">
            <div className="blog-grid">
              <div className="container ajax-container">
                <h2 className="text-6 fw-600 text-center mb-4">
                  {project.title}
                </h2>
                <div className="row g-4">
                  <div className="col-md-7">
                    <SimpleCarousel
                      images={project.images || []}
                      thumbImage={project.thumbImage}
                    />
                  </div>
                  <div className="col-md-5">
                    <h4 className="text-4 fw-600">Project Details:</h4>
                    <ul className="list-style-2">
                      <li>
                        <span className="text-dark fw-600 me-2">
                          Client:
                        </span>
                        {project.client}
                      </li>
                      <li>
                        <span className="text-dark fw-600 me-2">
                          Technologies:
                        </span>
                        {project.technologies.map((tech, index) => {
                          const badgeColor = tech.type === 'language' ? 'bg-primary'
                            : tech.type === 'framework' ? 'bg-secondary' : 'bg-success';
                          return (
                            <span key={index} className={`badge ${badgeColor} me-1 technology`}>
                              {tech.name}
                            </span>
                          );
                        })}
                      </li>
                      <li>
                        <span className="text-dark fw-600 me-2">
                          Industry:
                        </span>
                        {project.industry}
                      </li>
                      <li>
                        <span className="text-dark fw-600 me-2">
                          Date:
                        </span>
                        {util.formatDate(project.date)}
                      </li>
                      <li>
                        <span className="text-dark fw-600 me-2">
                          URL:
                        </span>
                        {project.urls.map((url, index) => {
                          const badgeColor = url.type === 'GitHub' ? 'badge-github'
                            : url.type === 'Website' ? 'badge-website' : 'badge-secondary';
                          return (
                            <a
                              href={url.link}
                              className={`btn ${badgeColor} shadow-none rounded-0 px-2 py-0 url-button`}
                              target="_blank"
                              rel="noopener noreferrer"
                              key={index}
                            >
                              {url.name}
                            </a>
                          );
                        })}
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
              <article className="article">
                <div className="article-content">
                  <div dangerouslySetInnerHTML={{ __html: purifiedDescription }} />
                </div>
              </article>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default PortfolioModal;