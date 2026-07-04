'use client';
import { useEducation,useJobs } from '@/hooks';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  calculateJobDuration,
  formatJobDurationRange,
  getLocalizedJobType,
  getLocalizedJobValue,
} from '@/lib/resumeLocalization';
import type { Education } from '@/services/resumeService';

const getEducationPassingYear = (education: Education): string => education.passingYear || education.duration || '';
const getEducationDegreeTitle = (education: Education): string => education.degreeTitle || education.degree || '';
const getEducationInstituteName = (education: Education): string => education.instituteName || education.school || '';

const Resume = () => {
  const { t, i18n } = useTranslation();
  const { jobs: fetchedJobs, loading: _jobsLoading } = useJobs();
  const { education: fetchedEducation, loading: _educationLoading } = useEducation();
  const language = i18n.language === 'ja' ? 'ja' : 'en';

  const jobs = useMemo(() => {
    const visible = fetchedJobs.filter((job) => !job.hidden);
    return [...visible].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }, [fetchedJobs]);

  const educations = useMemo(() => {
    return [...fetchedEducation].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }, [fetchedEducation]);

  return (
    <>
      <section id="resume" className="section">
        <div className="container">
          <div className="title">
            <h3>{t('home.resume.experienceTitle')}</h3>
          </div>
          {/* End title */}
          <div className="resume-box">
            {jobs.map((val, i) => (
              <div
                className="resume-row"
                key={i}
                data-aos="fade-up"

                data-aos-delay={val.delayAnimation}
              >
                <div className="row">
                  <div className="col-md-4 col-xl-3">
                    <div className="rb-left">
                      <h6>{getLocalizedJobValue(val, 'jobPosition', language)}</h6>
                      <div className="rob-title">{getLocalizedJobValue(val, 'companyName', language)}</div>
                      <label>{getLocalizedJobType(val, language, t)}</label>
                      <p>{val.jobDuration ? formatJobDurationRange(val.jobDuration, language) : ''}</p>
                      <div className="rb-time">{val.jobDuration ? calculateJobDuration(val.jobDuration, language) : ''}</div>
                    </div>
                  </div>
                  <div className="col-md-8 col-xl-9">
                    <div className="rb-right">
                      <h6>{getLocalizedJobValue(val, 'companyName', language)}</h6>
                      <p>{getLocalizedJobValue(val, 'jobDescription', language)}</p>
                      {val.technologies && val.technologies.length > 0 && (
                        <div className="mt-3" style={{ marginTop: '1rem' }}>
                          <strong style={{ fontSize: '14px', marginRight: '8px' }}>{t('home.resume.technologiesLabel')}</strong>
                          {val.technologies.map((tech, techIndex) => (
                            <span
                              key={techIndex}
                              className="inline-block bg-sky-500 text-white text-sm font-medium px-3 py-1 rounded-full mr-2 mb-2"
                              style={{
                                display: 'inline-block',
                                backgroundColor: '#0ea5e9',
                                color: 'white',
                                fontSize: '14px',
                                fontWeight: '500',
                                padding: '4px 12px',
                                borderRadius: '9999px',
                                marginRight: '8px',
                                marginBottom: '8px',
                              }}
                            >
                              {tech}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* separated */}
          <div
            className="separated"
            style={{
              backgroundImage: `url('/img/border-dark.png')`,
            }}
          ></div>
          {/* End separated */}

          <div className="title">
            <h3>{t('home.resume.educationTitle')}</h3>
          </div>

          <div className="row justify-content-center">
            <div
              className="col-lg-10 col-xl-8 m-15px-tb"
              data-aos="fade-up"

            >
              <ul className="aducation-box">
                {educations.map((val, i) => (
                  <li key={i}>
                    <span>{getEducationPassingYear(val)}</span>
                    <h6>{getEducationDegreeTitle(val)}</h6>
                    <p>{getEducationInstituteName(val)}</p>
                  </li>
                ))}
              </ul>
            </div>
            {/* End .col */}
          </div>
        </div>
      </section>
    </>
  );
};

export default Resume;
