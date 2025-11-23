import Social from '../Social';
import { differenceInYears } from 'date-fns';
import { useProfile } from '@/hooks/useProfile';

const About = () => {
  const { profile } = useProfile();

  // Calculate age dynamically from birthdate
  const calculateAge = (birthdate: string) => {
    return differenceInYears(new Date(), new Date(birthdate));
  };

  // Default values while loading or if profile is not available
  const profileData = profile || {
    birthdate: '1998-06-15',
    location: 'San Francisco, Remote',
    email: 'uwyudai@gmail.com',
    languages: ['English', 'Japanese'],
  };

  const aboutText = "Hi, I'm Yudai, a full-stack engineer cultivating solutions from the vibrant tech hub of San Francisco. My career is a testament to the practical application of classroom knowledge, where concepts learned have been transformed into functional digital tools. I've had the pleasure of creating the Tokachi Musubi website, a platform that allows food truck owners to seamlessly manage their culinary offerings. My portfolio also includes engaging applications like a custom AI for Gomoku, showcasing my commitment to interactive and thoughtful software design. In the professional sphere, I've contributed to robust payment systems, honing my skills in a high-volume, team-oriented environment. Beyond my work, I am dedicated to personal growth, exploring AI and machine learning as part of my continuous learning journey. It's this blend of professional experience and personal exploration that fuels my passion for developing technologies that not only function but also fascinate and inspire.";

  const age = calculateAge(profileData.birthdate);

  return (
    <>
      <section id="about" className="section theme-light dark-bg">
        <div className="container">
          <div className="row align-items-center justify-content-center">
            <div
              className="col-md-6 col-lg-4"
              data-aos="fade-up"
              data-aos-duration="1200"
            >
              <div className="about-me">
                <div className="img">
                  <div className="img-in">
                    <img src="img/about/about-me.jpg" alt="about" />
                  </div>

                  <Social />

                  {/* End social icon */}
                </div>
                {/* End img */}
                <div className="info">
                  <p>Software Engineer</p>
                  <h3>Yudai Yaguchi</h3>
                </div>
                {/* End info */}
              </div>
              {/* End about-me */}
            </div>
            {/* End col */}

            <div
              className="col-lg-7 ml-auto"
              data-aos="fade-up"
              data-aos-duration="1200"
              data-aos-delay="200"
            >
              <div className="about-info">
                <div className="title">
                  <h3>Biography</h3>
                </div>

                <div className="about-text">
                  <p>{aboutText}</p>
                </div>
                <div className="info-list">
                  <div className="row">
                    <div className="col-sm-6">
                      <ul>
                        <li>
                          <label>Age: </label>
                          <span>{age} years</span>
                        </li>
                        <li>
                          <label>Location: </label>
                          <span>{profileData.location}</span>
                        </li>
                      </ul>
                    </div>
                    <div className="col-sm-6">
                      <ul>
                        <li>
                          <label>Email: </label>
                          <span>{profileData.email}</span>
                        </li>
                        <li>
                          <label>Language: </label>
                          <span>{profileData.languages.join(', ')}</span>
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            {/* End col */}
          </div>

          {/* separated */}

          <div
            className="separated"
            style={{
              backgroundImage: `url('/img/border-dark.png')`,
            }}
          ></div>

          {/* End separated */}
          {/* <div className="title">
            <h3>What I do?</h3>
          </div>

          <Services /> */}

          {/* End .row */}

          {/* separated */}
          {/* <div
            className="separated"
            style={{
              backgroundImage: `url('/img/border-dark.png')`,
            }}
          ></div> */}
          {/* End separated */}

          {/* <div className="title">
            <h3>Awards.</h3>
          </div>

          <Awards /> */}
          {/* End Awards */}

          {/* separated */}
          {/* <div
            className="separated"
            style={{
              backgroundImage: `url('/img/border-dark.png')`,
            }}
          ></div> */}
          {/* End separated */}
          {/* 
          <div className="title">
            <h3>Testimonials.</h3>
          </div>

          <Testimonials /> */}
          {/* End Testimonaial */}
        </div>
      </section>
    </>
  );
};

export default About;
