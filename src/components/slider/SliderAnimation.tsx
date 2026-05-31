'use client';
import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { TypeAnimation } from 'react-type-animation';
import * as profileApi from '@/services/profileService';
import { useTranslation } from 'react-i18next';

const HERO_IMAGE_URL =
  'https://firebasestorage.googleapis.com/v0/b/yudai-portfolio.appspot.com/o/profile_image2.jpg?alt=media&token=24f54f49-e8cc-4c70-a52a-0edb97e456f0';

const conctInfo = {
  email: 'uwyudai@gmail.com',
};

const Slider = () => {
  const [resumeLink, setResumeLink] = useState('');
  const [mounted, setMounted] = useState(false);
  const { t } = useTranslation();
  const description = t('home.hero.description');
  const heroStats = [
    {
      value: t('home.hero.stats.experienceValue'),
      label: t('home.hero.stats.experience'),
    },
    {
      value: t('home.hero.stats.complianceValue'),
      label: t('home.hero.stats.compliance'),
    },
    {
      value: t('home.hero.stats.locationValue'),
      label: t('home.hero.stats.location'),
    },
  ];

  const fetchLink = async () => {
    const link = await profileApi.getResumeLink();
    setResumeLink(link);
  };

  useEffect(() => {
    fetchLink();
    // TypeAnimation renders an empty wrapper on SSR and starts typing
    // on the client, which produces a React #418 hydration mismatch.
    // Gate it behind `mounted` and render a static fallback for the
    // first paint so SSR + client first render agree.
    setMounted(true);
  }, []);

  return (
    <>
      {/*  Home Banner */}
      <section id="home" className="home-banner modern-hero">
        <div className="hb-top-fixed d-flex">
          <div className="hb-info">
            <a href="mailto:uwyudai@gmail.com">
              {conctInfo.email}
            </a>
          </div>
          {/* <div className="hb-lang">
            <ul className="nav">
              <li className="active">
                <a href="#">EN</a>
              </li>
              <li>
                <a href="#">FR</a>
              </li>
            </ul>
          </div> */}
        </div>
        {/* End hp-top-fixed */}

        <div className="container">
          <div className="row full-screen align-items-center">
            <div className="col-lg-7">
              <div className="type-box modern-type-box">
                <span className="hero-badge" data-aos="fade-up">
                  {t('home.hero.badge')}
                </span>
                <h6 data-aos="fade-up">
                  {t('home.hero.greeting')}
                </h6>
                <h1
                  className="font-alt"
                  data-aos="fade-up"

                  data-aos-delay="100"
                >
                  {t('home.hero.name')}
                </h1>
                <div
                  data-aos="fade-up"

                  data-aos-delay="200"
                >
                  {mounted ? (
                    <TypeAnimation
                      sequence={[
                        t('home.hero.roles.seniorSoftwareEngineer'),
                        2000,
                        t('home.hero.roles.fintechEngineer'),
                        2000,
                        t('home.hero.roles.infrastructureEngineer'),
                        2000,
                      ]}
                      wrapper="p"
                      speed={50}
                      className="loop-text lead"
                      repeat={Infinity}
                    />
                  ) : (
                    <p className="loop-text lead">
                      {t('home.hero.roles.seniorSoftwareEngineer')}
                    </p>
                  )}
                </div>

                <p
                  className="desc"
                  data-aos="fade-up"

                  data-aos-delay="300"
                >
                  {description}
                </p>
                <div className="hero-stats" data-aos="fade-up" data-aos-delay="350">
                  {heroStats.map((stat) => (
                    <div className="hero-stat" key={stat.value}>
                      <strong>{stat.value}</strong>
                      <span>{stat.label}</span>
                    </div>
                  ))}
                </div>
                <div
                  className="hero-actions"
                  data-aos="fade-up"

                  data-aos-delay="400"
                >
                  <a
                    className="px-btn px-btn-theme"
                    href={resumeLink}
                    download
                    aria-label="Download resume"
                  >
                    {t('home.hero.cta.downloadCv')}
                  </a>
                  <Link className="px-btn px-btn-outline" href="/work" aria-label="View featured work">
                    {t('home.hero.cta.viewProjects')}
                  </Link>
                  <Link className="px-btn px-btn-white" href="/#tools" aria-label="Explore tools">
                    {t('home.hero.cta.exploreTools')}
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
        {/* End Container*/}
        <div className="hb-me">
          {/*
           * Use next/image with `fill` so we get automatic responsive
           * srcset + WebP optimization for the LCP image. `priority`
           * makes it preloaded — this is the largest contentful paint
           * on the home page.
           */}
          <Image
            src={HERO_IMAGE_URL}
            alt="Yudai Yaguchi"
            fill
            priority
            sizes="(max-width: 768px) 80vw, 50vw"
            style={{ objectFit: 'cover', objectPosition: 'top left' }}
          />
        </div>
      </section>

      {/* End Home Banner  */}
    </>
  );
};

export default Slider;
