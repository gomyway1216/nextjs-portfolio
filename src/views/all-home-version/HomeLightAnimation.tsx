'use client';

import React, { useEffect } from 'react';
import Header from '@/components/header/Header';
import Slider from '@/components/slider/SliderAnimation';
import About from '@/components/about/AboutAnimation';
import Resume from '@/components/resume/ResumeAnimation';
import Portfolio from '@/components/portfolio/PortfolioAnimation';
import GamesSlideshow from '@/components/games/GamesSlideshow';
import ToolsSection from '@/components/tools/ToolsSection';
import Blog from '@/components/blog/BlogAnimation';
import Footer from '@/components/footer/FooterAnimation';
import useDocumentTitle from '@/components/useDocumentTitle';

const HomeOne = () => {
  useDocumentTitle(
    'Yudai Portfolio'
  );

  useEffect(() => {
    document.body.classList.add('theme-light');
    return () => {
      document.body.classList.remove('theme-light');
    };
  }, []);

  return (
    <div className="main-left home-modern">
      <Header />

      <Slider />

      <section id="work" className="section theme-light dark-bg modern-section">
        <div className="container">
          <div className="title modern-title">
            <h3>Featured Work</h3>
            <p>Selected projects that blend product thinking, clean code, and practical impact.</p>
          </div>
          <Portfolio />
        </div>
      </section>
      {/* End Portfolio Section */}

      <section id="tools" className="section theme-light dark-bg modern-section">
        <div className="container">
          <div className="title modern-title">
            <h3>Useful Tools</h3>
            <p>Production-ready utilities built to solve real-world day-to-day problems.</p>
          </div>
          <ToolsSection />
        </div>
      </section>
      {/* End Tools Section */}

      <section id="games" className="section modern-section">
        <div className="container">
          <div className="title modern-title">
            <h3>Interactive Games</h3>
            <p>Playable experiments focused on UX, performance, and game logic design.</p>
          </div>
          <GamesSlideshow />
        </div>
      </section>
      {/* End Games Section */}

      <section id="blog" className="section modern-section">
        <div className="container">
          <div className="title modern-title">
            <h3>Latest Blog</h3>
            <p>Notes on engineering, lessons learned, and ideas explored in public.</p>
          </div>
          <Blog />
          {/* <div onClick={() => navigate('/all')}>Check more blogs</div> */}
        </div>
      </section>
      {/* End Blog Section */}

      <About />

      <Resume />

      {/* <section id="contactus" className="section theme-light dark-bg">
        <div className="container">
          <div className="row">
            <div
              className="col-lg-5 col-xl-4 m-15px-tb"
              data-aos="fade-right"
              data-aos-duration="1200"
            >
              <ContactInfo />
            </div>

            <div
              className="col-lg-7 ml-auto m-15px-tb"
              data-aos="fade-right"
              data-aos-duration="1200"
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
              data-aos-duration="1200"
              data-aos-delay="300"
            >
              <Map />
            </div>
          </div>
        </div>
      </section> */}

      <footer className="footer white modern-footer">
        <div className="container">
          <Footer />
        </div>
      </footer>
    </div>
  );
};

export default HomeOne;
