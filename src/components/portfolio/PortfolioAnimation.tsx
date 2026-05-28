'use client';
import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import { Tab, Tabs, TabList, TabPanel } from 'react-tabs';
import 'photoswipe/dist/photoswipe.css';
import PortfolioModal from './PortfolioModal';
import * as projectApi from '@/services/projectsService';
import type { Project } from '@/services/projectsService';
import * as util from '@/lib/utils/util';

const breakpointColumnsObj = {
  default: 3,
  1100: 3,
  700: 2,
  500: 1,
};


const tabList = ['All', 'Web App', 'Mobile', 'AI/ML', 'Console'];
type PortfolioCategory = typeof tabList[number];
type ProjectsByCategory = Record<PortfolioCategory, Project[]>;

const PortfolioAnimation = () => {
  const [projectsByCategory, setProjectsByCategory]
    = useState<ProjectsByCategory>({'All': [], 'Web App': [], 'Mobile': [], 'AI/ML': [], 'Console': []});
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);

  useEffect(() => {
    classifyProjects();
  }, []);

  const handleProjectClick = (project: Project) => {
    setSelectedProject(project);
    setIsModalOpen(true);
  };

  const classifyProjects = async () => {
    const classified: ProjectsByCategory = {All: [], 'Web App': [], Mobile: [], 'AI/ML': [], 'Console': []};

    const fetchedProjects: Project[] = await projectApi.getProjects();

    fetchedProjects.forEach((project) => {
      // Add to 'All' category
      classified['All'].push(project);
      // Add to other categories based on the project's category
      project.categories.forEach((cat) => {
        if (Object.prototype.hasOwnProperty.call(classified, cat)) {
          classified[cat as PortfolioCategory].push(project);
        }
      });
    });

    setProjectsByCategory(classified);
  };

  return (
    <>
      <div className="portfolio-filter-01">
        <Tabs>
          <TabList className="filter d-flex flex-wrap justify-content-start">
            {tabList.map((val, i) => (
              <Tab key={i}>{val}</Tab>
            ))}
          </TabList>
          {/* End tablist */}
          {Object.keys(projectsByCategory).map((category: string, i: number) => (
            <TabPanel key={i}>
              <div className="row">
                {projectsByCategory[category as PortfolioCategory].map((project, j) => (
                  <div
                    className="col-md-6 m-15px-tb"
                    data-aos="fade-right"

                    key={category + ':' + j}
                  >
                    <div
                      className="blog-grid modern-card"
                      onClick={() => handleProjectClick(project)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          handleProjectClick(project);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                    >
                      <div className="blog-img" style={{ position: 'relative', aspectRatio: '16 / 10' }}>
                        {project.thumbImage && (
                          <Image
                            src={project.thumbImage}
                            alt={project.title || 'Project thumbnail'}
                            fill
                            sizes="(max-width: 700px) 100vw, (max-width: 1100px) 50vw, 33vw"
                            style={{ objectFit: 'cover' }}
                          />
                        )}
                      </div>
                      <div className="blog-info">
                        <div className="meta">{util.formatDate(project.date)}</div>
                        <h6>
                          <a>
                            {project.title}
                          </a>
                        </h6>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              
            </TabPanel>
          ))}
        </Tabs>
      </div>

      {selectedProject && (
        <PortfolioModal
          project={selectedProject}
          isOpen={isModalOpen}
          setIsOpen={setIsModalOpen}
        />
      )}
    </>

  );
};

export default PortfolioAnimation;
