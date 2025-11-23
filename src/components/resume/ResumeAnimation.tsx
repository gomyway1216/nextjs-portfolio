'use client';
import React, { useEffect, useState, useMemo } from 'react';
import Skills from '../skills/Skills';
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
    return [...fetchedJobs].sort((a: any, b: any) => a.order - b.order);
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
            <h3>Education & Skills</h3>{' '}
          </div>

          <div className="row">
            <div
              className="col-lg-4 m-15px-tb"
              data-aos="fade-up"
              data-aos-duration="1200"
            >
              <ul className="aducation-box">
                {educations.map((val, i) => (
                  <li key={i}>
                    <span>{val.passingYear}</span>
                    <h6>{val.degreeTitle} </h6>
                    <p>{val.instituteName}</p>{' '}
                  </li>
                ))}
              </ul>
            </div>
            {/* End .col */}

            <div
              className="col-lg-7 ml-auto m-15px-tb"
              data-aos="fade-up"
              data-aos-duration="1200"
              data-aos-delay="200"
            >
              <Skills />
            </div>
            {/* End .col */}
          </div>
        </div>
      </section>
    </>
  );
};

export default Resume;
