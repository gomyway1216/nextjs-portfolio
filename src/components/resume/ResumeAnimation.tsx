'use client';
import { useEducation,useJobs } from '@/hooks';
import { differenceInMonths,parse } from 'date-fns';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

const formatDate = (dateString: string) => {
  // Handle present case
  if (dateString.toLowerCase() === 'present') {
    return new Date();
  }
  // Parse a date string in the format "MMM yyyy"
  return parse(dateString, 'MMM yyyy', new Date());
};

const calculateDuration = (jobDuration: string, language: 'en' | 'ja') => {
  const [start, end] = jobDuration.split(' - ');
  const startDate = formatDate(start);
  const endDate = formatDate(end);
  // Calculate the difference in months between the start and end date
  const months = differenceInMonths(endDate, startDate);
  // Convert months to years and months
  const years = Math.floor(months / 12);
  const remainingMonths = months % 12;

  if (language === 'ja') {
    return `${years > 0 ? `${years}年 ` : ''}${remainingMonths}ヶ月`;
  }

  return `${years > 0 ? `${years} yrs ` : ''}${remainingMonths} mos`;
};

const getNestedValue = (obj: Record<string, unknown>, path: string) => {
  const keys = path.split('.');
  let current: unknown = obj;
  for (const key of keys) {
    if (!current || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
};

const getLocalizedJobValue = (
  job: Record<string, unknown>,
  baseField: string,
  language: 'en' | 'ja'
) => {
  if (language === 'ja') {
    const jaPaths = [
      `${baseField}Ja`,
      `${baseField}JA`,
      `${baseField}Japanese`,
      `${baseField}_ja`,
      `${baseField}_jp`,
      `ja.${baseField}`,
      `jp.${baseField}`,
      `japanese.${baseField}`,
      `translations.ja.${baseField}`,
      `translations.jp.${baseField}`,
      `localized.ja.${baseField}`,
      `locale.ja.${baseField}`,
    ];

    for (const path of jaPaths) {
      const value = getNestedValue(job, path);
      if (typeof value === 'string' && value.trim()) return value;
    }
  }

  const enPaths = [
    `${baseField}En`,
    `${baseField}EN`,
    `${baseField}_en`,
    `en.${baseField}`,
    `translations.en.${baseField}`,
    `localized.en.${baseField}`,
    `locale.en.${baseField}`,
    baseField,
  ];

  for (const path of enPaths) {
    const value = getNestedValue(job, path);
    if (typeof value === 'string' && value.trim()) return value;
  }

  return '';
};

const normalizeJobType = (value: string) => value.trim().toLowerCase();

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

  const translateJobType = (jobType: string) => {
    const normalized = normalizeJobType(jobType);
    const mapping: Record<string, string> = {
      'full-time': t('home.resume.jobType.fullTime'),
      fulltime: t('home.resume.jobType.fullTime'),
      parttime: t('home.resume.jobType.partTime'),
      'part-time': t('home.resume.jobType.partTime'),
      contract: t('home.resume.jobType.contract'),
      internship: t('home.resume.jobType.internship'),
      intern: t('home.resume.jobType.internship'),
      freelance: t('home.resume.jobType.freelance'),
      remote: t('home.resume.jobType.remote'),
    };

    return mapping[normalized] || jobType;
  };

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
                      <label>{translateJobType(getLocalizedJobValue(val, 'jobType', language))}</label>
                      <p>{val.jobDuration || ''}</p>
                      <div className="rb-time">{val.jobDuration ? calculateDuration(val.jobDuration, language) : ''}</div>
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
                    <span>{val.passingYear}</span>
                    <h6>{val.degreeTitle}</h6>
                    <p>{val.instituteName}</p>
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
