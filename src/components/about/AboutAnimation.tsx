import Image from 'next/image';
import Social from '../Social';
import { differenceInYears } from 'date-fns';
import { useProfile, type Profile } from '@/hooks/useProfile';
import { isSupportedProfileImageUrl } from '@/lib/profileImage';
import { useTranslation } from 'react-i18next';

interface AboutProps {
  initialProfile?: Profile | null;
}

const About = ({ initialProfile }: AboutProps) => {
  const { t } = useTranslation();
  const { profile, loading: profileLoading } = useProfile(initialProfile);

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
  const profileImageUrl = isSupportedProfileImageUrl(profile?.profileImageUrl)
    ? profile.profileImageUrl
    : profileLoading
      ? null
      : '/img/about/about-me.jpg';

  const aboutText = t('home.about.biographyText');

  const age = calculateAge(profileData.birthdate);

  return (
    <>
      <section id="about" className="section theme-light dark-bg">
        <div className="container">
          <div className="row align-items-center justify-content-center">
            <div
              className="col-md-6 col-lg-4"
              data-aos="fade-up"

            >
              <div className="about-me">
                <div className="img">
                  <div className="img-in">
                    {profileImageUrl ? (
                      <Image
                        src={profileImageUrl}
                        alt="about"
                        width={400}
                        height={500}
                        quality={95}
                        sizes="(max-width: 768px) 80vw, 400px"
                        style={{ width: '100%', height: 'auto' }}
                      />
                    ) : (
                      <div aria-hidden="true" style={{ aspectRatio: '4 / 5', width: '100%' }} />
                    )}
                  </div>

                  <Social />

                  {/* End social icon */}
                </div>
                {/* End img */}
                <div className="info">
                  <p>{t('home.about.role')}</p>
                  <h3>{t('home.hero.name')}</h3>
                </div>
                {/* End info */}
              </div>
              {/* End about-me */}
            </div>
            {/* End col */}

            <div
              className="col-lg-7 ml-auto"
              data-aos="fade-up"

              data-aos-delay="200"
            >
              <div className="about-info">
                <div className="title">
                  <h3>{t('home.about.title')}</h3>
                </div>

                <div className="about-text">
                  <p>{aboutText}</p>
                </div>
                <div className="info-list">
                  <div className="row">
                    <div className="col-sm-6">
                      <ul>
                        <li>
                          <label>{t('home.about.labels.age')} </label>
                          <span>{t('home.about.values.ageYears', { age })}</span>
                        </li>
                        <li>
                          <label>{t('home.about.labels.location')} </label>
                          <span>{profileData.location}</span>
                        </li>
                      </ul>
                    </div>
                    <div className="col-sm-6">
                      <ul>
                        <li>
                          <label>{t('home.about.labels.email')} </label>
                          <span>{profileData.email}</span>
                        </li>
                        <li>
                          <label>{t('home.about.labels.language')} </label>
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
