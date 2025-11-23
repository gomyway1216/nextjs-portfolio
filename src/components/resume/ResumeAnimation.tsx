'use client';
import React, { useEffect, useState, useMemo } from 'react';
import { Tab, Tabs, TabList, TabPanel } from 'react-tabs';
import content from './content.json';
import { differenceInMonths, parse } from 'date-fns';
import { useJobs, useEducation } from '@/hooks';

const formatDate = (dateString: any) => {
  // Handle present case
  if (dateString.toLowerCase() === 'present') {
    return new Date();
  }
  // Parse a date string in the format "MMM yyyy"
  return parse(dateString, 'MMM yyyy', new Date());
};

const calculateDuration = (jobDuration: any) => {
  const [start, end] = jobDuration.split(' - ');
  const startDate = formatDate(start);
  const endDate = formatDate(end);
  // Calculate the difference in months between the start and end date
  const months = differenceInMonths(endDate, startDate);
  // Convert months to years and months
  const years = Math.floor(months / 12);
  const remainingMonths = months % 12;
  // Create a string representation
  return `${years > 0 ? `${years} yrs ` : ''}${remainingMonths} mos`;
};

const Resume = () => {
  const { jobs: fetchedJobs, loading: jobsLoading } = useJobs();
  const { education: fetchedEducation, loading: educationLoading } = useEducation();

  const jobs = useMemo(() => {
    const sorted = [...fetchedJobs].sort((a: any, b: any) => a.order - b.order);
    console.log('[Resume] Jobs data:', sorted);
    sorted.forEach(job => {
      console.log(`[Resume] ${job.companyName} - technologies:`, job.technologies);
    });
    return sorted;
  }, [fetchedJobs]);

  const educations = useMemo(() => {
    return [...fetchedEducation].sort((a: any, b: any) => a.order - b.order);
  }, [fetchedEducation]);

  // useEffect(() => {
  //   // Insert data into Firestore
  //   addJobsToFirestore(content.jobs)
  //     .then(() => console.log('Jobs added successfully!'))
  //     .catch((error) => console.error('Error adding jobs to Firestore:', error));
  
  //   addEducationToFirestore(content.education)
  //     .then(() => console.log('Education added successfully!'))
  //     .catch((error) => console.error('Error adding education to Firestore:', error));
  // }, []); 


  // const { jobs, education } = content;
  return (
    <>
      <section id="resume" className="section">
        <div className="container">
          <div className="title">
            <h3>Experience</h3>
          </div>
          {/* End title */}
          <div className="resume-box">
            {jobs.map((val, i) => (
              <div
                className="resume-row"
                key={i}
                data-aos="fade-up"
                data-aos-duration="1200"
                data-aos-delay={val.delayAnimation}
              >
                <div className="row">
                  <div className="col-md-4 col-xl-3">
                    <div className="rb-left">
                      <h6>{val.jobPosition}</h6>
                      <div className="rob-title">{val.companyName}</div>
                      <label>{val.jobType}</label>
                      <p>{val.jobDuration}</p>
                      <div className="rb-time">{calculateDuration(val.jobDuration)}</div>
                    </div>
                  </div>
                  <div className="col-md-8 col-xl-9">
                    <div className="rb-right">
                      <h6>{val.compnayName}</h6>
                      <p>{val.jobDescription}</p>
                      {val.technologies && val.technologies.length > 0 && (
                        <div className="mt-3" style={{ marginTop: '1rem' }}>
                          <strong style={{ fontSize: '14px', marginRight: '8px' }}>Technologies:</strong>
                          {val.technologies.map((tech: string, techIndex: number) => (
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
            <h3>Education</h3>
          </div>

          <div className="row justify-content-center">
            <div
              className="col-lg-10 col-xl-8 m-15px-tb"
              data-aos="fade-up"
              data-aos-duration="1200"
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
