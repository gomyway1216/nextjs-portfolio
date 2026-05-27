'use client';
import React, { useMemo } from 'react';
import Image from 'next/image';
import * as Dialog from '@radix-ui/react-dialog';
import { useAuth } from '@/providers/AuthProvider';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import * as util from '@/lib/utils/util';
import DOMPurify from 'dompurify';
import SimpleCarousel from './SimpleCarousel';

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
    date: Date | string;
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

  const purifiedDescription = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return DOMPurify.sanitize(project.description, {
      ADD_TAGS: ['iframe'],
      ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'scrolling']
    });
  }, [project.description]);

  const closeModal = () => {
    setIsOpen(false);
  };

  const handleEdit = () => {
    router.push(`/projects/${project.id}/edit`);
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={setIsOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="custom-overlay" />
        <Dialog.Content className="custom-modal" aria-describedby={undefined}>
          <Dialog.Title className="sr-only">{project.title}</Dialog.Title>
          {currentUser && <Button onClick={handleEdit} className="mb-4">EDIT</Button>}
          <Dialog.Close asChild>
            <button className="close-modal" aria-label="Close">
              <Image src="/img/cancel.svg" alt="close icon" width={45} height={45} />
            </button>
          </Dialog.Close>

        <div className="box_inner">
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
        </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export default PortfolioModal;
