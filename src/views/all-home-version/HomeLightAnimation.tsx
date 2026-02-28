'use client';

import React from 'react';
import Header from '@/components/header/Header';
import Slider from '@/components/slider/SliderAnimation';
import About from '@/components/about/AboutAnimation';
import Resume from '@/components/resume/ResumeAnimation';
import Portfolio from '@/components/portfolio/PortfolioAnimation';
import GamesSlideshow from '@/components/games/GamesSlideshow';
import ToolsSection from '@/components/tools/ToolsSection';
import Blog from '@/components/blog/BlogAnimation';
import Contact from '@/components/contact/Contact';
import ContactInfo from '@/components/contact/ContactInfo';
import Map from '@/components/contact/Map';
import Footer from '@/components/footer/FooterAnimation';
import useDocumentTitle from '@/components/useDocumentTitle';
import { useRouter } from 'next/navigation';

const HomeOne = () => {
  const router = useRouter();

  useDocumentTitle(
    'Yudai Portfolio'
  );
  document.body.classList.add('theme-light');
  return (
    <div className="main-left">
      <Header />

      <Slider />

      <About />

      <Resume />

      <section id="work" className="section theme-light dark-bg">
        <div className="container">
          <div className="title">
            <h3>My Portfolio.</h3>
          </div>
          <Portfolio />
        </div>
      </section>
      {/* End Portfolio Section */}

      <section id="games" className="section">
        <div className="container">
          <div className="title">
            <h3>Interactive Games.</h3>
          </div>
          <GamesSlideshow />
        </div>
      </section>
      {/* End Games Section */}

      <section id="tools" className="section theme-light dark-bg">
        <div className="container">
          <div className="title">
            <h3>Useful Tools.</h3>
          </div>
          <ToolsSection />
        </div>
      </section>
      {/* End Tools Section */}

      <section id="blog" className="section">
        <div className="container">
          <div className="title">
            <h3>Latest Blog.</h3>
          </div>
          <Blog />
          {/* <div onClick={() => navigate('/all')}>Check more blogs</div> */}
        </div>
      </section>
      {/* End Blog Section */}

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

      <footer className="footer white">
        <div className="container">
          <Footer />
        </div>
      </footer>
    </div>
  );
};

export default HomeOne;
