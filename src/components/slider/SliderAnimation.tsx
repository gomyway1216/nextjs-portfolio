'use client';
import React, { useEffect, useState } from 'react';
import { TypeAnimation } from 'react-type-animation';
import * as profileApi from '@/services/profileService';

const conctInfo = {
  email: 'uwyudai@gmail.com',
};

const sliderContent = {
  name: 'Yudai Yaguchi',
  designation: 'Software Engineer',
  description: 'Guided by a desire to craft technology with purpose, ' +
    'I am dedicated to learning and applying my full-stack development skills to ' +
    'create solutions that benefit people and communities. Enthusiastic about ' +
    'the transformative potential of machine learning, I aspire to blend my ' +
    'technical knowledge with innovative ideas to deliver impactful digital experiences.',
  btnText: 'Download CV',
};

const Slider = () => {
  const [resumeLink, setResumeLink] = useState('');

  const fetchLink = async () => {
    const link = await profileApi.getResumeLink();
    setResumeLink(link);
  };

  useEffect(() => {
    fetchLink();
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
                <span className="hero-badge" data-aos="fade-up" data-aos-duration="1200">
                  Full-stack Engineer
                </span>
                <h6 data-aos="fade-up" data-aos-duration="1200">
                  Hello, my name is
                </h6>
                <h1
                  className="font-alt"
                  data-aos="fade-up"
                  data-aos-duration="1200"
                  data-aos-delay="100"
                >
                  {sliderContent.name}
                </h1>
                <div
                  data-aos="fade-up"
                  data-aos-duration="1200"
                  data-aos-delay="200"
                >
                  <TypeAnimation
                    sequence={[
                      'Full-stack Developer',
                      2000,
                      'Software Engineer',
                      2000,
                      'Web Developer',
                      2000,
                    ]}
                    wrapper="p"
                    speed={50}
                    className="loop-text lead"
                    repeat={Infinity}
                  />
                </div>

                <p
                  className="desc"
                  data-aos="fade-up"
                  data-aos-duration="1200"
                  data-aos-delay="300"
                >
                  {sliderContent.description}
                </p>
                <div
                  className="hero-actions"
                  data-aos="fade-up"
                  data-aos-duration="1200"
                  data-aos-delay="400"
                >
                  <a
                    className="px-btn px-btn-theme"
                    href={resumeLink}
                    download
                    aria-label="Download resume"
                  >
                    {sliderContent.btnText}
                  </a>
                  <a className="px-btn px-btn-outline" href="#work" aria-label="View featured work">
                    View Projects
                  </a>
                  <a className="px-btn px-btn-white" href="#tools" aria-label="Jump to tools section">
                    Explore Tools
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
        {/* End Container*/}
        <div
          className="hb-me"
          style={{
            backgroundImage: `url(${'https://firebasestorage.googleapis.com/v0/b/yudai-portfolio.appspot.com/o/profile_image2.jpg?alt=media&token=24f54f49-e8cc-4c70-a52a-0edb97e456f0'})`,
          }}
        ></div>
      </section>

      {/* End Home Banner  */}
    </>
  );
};

export default Slider;
