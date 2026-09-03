'use client';

import React, { useEffect } from 'react';
import Header from '@/components/header/Header';
import Slider from '@/components/slider/SliderAnimation';
import About from '@/components/about/AboutAnimation';
import ImpactSnapshot from '@/components/home/ImpactSnapshot';
import CommunityLeadership from '@/components/home/CommunityLeadership';
import Resume from '@/components/resume/ResumeAnimation';
import Portfolio from '@/components/portfolio/PortfolioAnimation';
import GamesSlideshow from '@/components/games/GamesSlideshow';
import ToolsSection from '@/components/tools/ToolsSection';
import StudyEntry from '@/components/home/StudyEntry';
import PublishedWriting from '@/components/home/PublishedWriting';
import HomeBlogSection, { type HomeBlogPost } from '@/components/home/HomeBlogSection';
import Footer from '@/components/footer/FooterAnimation';
import useDocumentTitle from '@/components/useDocumentTitle';
import { useTranslation } from 'react-i18next';
import { useTheme } from 'next-themes';
import type { Profile } from '@/hooks/useProfile';
import type { Writing } from '@/lib/writing';
import type { Project } from '@/services/projectsService';
import type { Education, Job } from '@/services/resumeService';

interface HomeOneProps {
  initialProfile?: Profile | null;
  initialWritings?: Writing[];
  initialBlogPosts?: HomeBlogPost[];
  initialHomeGameIds?: string[];
  initialJobs?: Job[];
  initialEducation?: Education[];
  initialProjects?: Project[];
  initialResumeLink?: string;
}

const HomeOne = ({
  initialProfile,
  initialWritings = [],
  initialBlogPosts = [],
  initialHomeGameIds,
  initialJobs,
  initialEducation,
  initialProjects,
  initialResumeLink,
}: HomeOneProps) => {
  const { t } = useTranslation();
  const { resolvedTheme } = useTheme();
  const hasPublishedWritings = initialWritings.length > 0;
  useDocumentTitle(
    t('app.title')
  );

  useEffect(() => {
    document.body.classList.remove('theme-light', 'theme-dark');
    document.body.classList.add(resolvedTheme === 'dark' ? 'theme-dark' : 'theme-light');
    return () => {
      document.body.classList.remove('theme-light', 'theme-dark');
    };
  }, [resolvedTheme]);

  return (
    <div className="main-left home-modern">
      <Header showWriting={hasPublishedWritings} />

      <Slider initialProfile={initialProfile} initialResumeLink={initialResumeLink} />

      <ImpactSnapshot />

      <Resume initialJobs={initialJobs} initialEducation={initialEducation} />

      {hasPublishedWritings && <PublishedWriting writings={initialWritings} />}

      <HomeBlogSection posts={initialBlogPosts} />

      <section id="tools" className="section theme-light dark-bg modern-section">
        <div className="container">
          <div className="title modern-title">
            <h3>{t('home.sections.tools.title')}</h3>
            <p>{t('home.sections.tools.subtitle')}</p>
          </div>
          <ToolsSection />
        </div>
      </section>
      {/* End Tools Section */}

      <section id="work" className="section theme-light dark-bg modern-section">
        <div className="container">
          <div className="title modern-title">
            <h3>{t('home.sections.work.title')}</h3>
            <p>{t('home.sections.work.subtitle')}</p>
          </div>
          <Portfolio initialProjects={initialProjects} />
        </div>
      </section>
      {/* End Portfolio Section */}

      <CommunityLeadership />

      <section id="study" className="section modern-section">
        <div className="container">
          <div className="title modern-title">
            <h3>{t('home.sections.study.title')}</h3>
            <p>{t('home.sections.study.subtitle')}</p>
          </div>
          <StudyEntry />
        </div>
      </section>
      {/* End Study Section */}

      <section id="games" className="section modern-section">
        <div className="container">
          <div className="title modern-title">
            <h3>{t('home.sections.games.title')}</h3>
            <p>{t('home.sections.games.subtitle')}</p>
          </div>
          <GamesSlideshow gameIds={initialHomeGameIds} />
        </div>
      </section>
      {/* End Games Section */}

      <About initialProfile={initialProfile} />

      {/* <section id="contactus" className="section theme-light dark-bg">
        <div className="container">
          <div className="row">
            <div
              className="col-lg-5 col-xl-4 m-15px-tb"
              data-aos="fade-right"

            >
              <ContactInfo />
            </div>

            <div
              className="col-lg-7 ml-auto m-15px-tb"
              data-aos="fade-right"

              data-aos-delay="200"
            >
              <div className="contact-form">
                <h4>Say Something</h4>
                <Contact />
              </div>
            </div>

            <div
              className="col-12"
              data-aos="fade-up"

              data-aos-delay="300"
            >
              <Map />
            </div>
          </div>
        </div>
      </section> */}

      <footer className="footer white modern-footer">
        <div className="container">
          <Footer initialProfile={initialProfile} />
        </div>
      </footer>
    </div>
  );
};

export default HomeOne;
