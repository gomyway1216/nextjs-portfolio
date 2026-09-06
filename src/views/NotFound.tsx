'use client';

import React from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import Footer from '@/components/footer/FooterAnimation';
import useDocumentTitle from '@/components/useDocumentTitle';

const NotFound = () => {
  const { t } = useTranslation();
  useDocumentTitle(t('notFound.documentTitle'));
  return (
    <>
      <section className="error-page-wrapper">
        <div className="container">
          <div className="row justify-content-center full-screen align-items-center">
            <div className="col-lg-8 text-center">
              <div className="inner">
                <h1 className="display-3 white-color m-15px-b">
                  {t('notFound.title')}
                </h1>
                <p className="h4">
                  {t('notFound.text')}
                </p>
                {/* A dead end is where visitors leave: offer the sections
                    people actually come here for, not just "home". */}
                <div className="btn-bar mt-4 error-page-actions">
                  <Link className="px-btn px-btn-white" href="/">
                    {t('notFound.backHome')}
                  </Link>
                  <Link className="px-btn px-btn-theme" href="/blog">
                    {t('notFound.browseBlog')}
                  </Link>
                  <Link className="px-btn px-btn-theme" href="/projects">
                    {t('notFound.viewProjects')}
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
      {/* End Error Page Wrapper */}

      {/* Footer */}
      <footer className="footer white">
        <div className="container">
          <Footer />
        </div>
      </footer>
      {/* End footer */}
    </>
  );
};

export default NotFound;
