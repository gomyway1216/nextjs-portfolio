'use client';
import React, { useState } from 'react';
import CountUp from 'react-countup';
import VisibilitySensor from 'react-visibility-sensor';
import { Tab, Tabs, TabList, TabPanel } from 'react-tabs';
import 'react-tabs/style/react-tabs.css';

const skillContent = [
  {
    name: 'Java',
    numberPercent: '90',
    startCount: '0',
    category: 'Backend',
    endCount: '90',
  },
  {
    name: 'React JS',
    numberPercent: '80',
    category: 'Frontend',
    startCount: '0',
    endCount: '85',
  },
  {
    name: 'Javascript',
    numberPercent: '50',
    startCount: '0',
    category: 'Frontend',
    endCount: '50',
  },
  {
    name: 'Typescript',
    numberPercent: '40',
    startCount: '0',
    category: 'Backend',
    endCount: '40',
  },
  {
    name: 'Flutter',
    numberPercent: '20',
    startCount: '0',
    category: 'Frontend',
    endCount: '20',
  },
  {
    name: 'Python',
    numberPercent: '10',
    startCount: '0',
    category: 'Backend',
    endCount: '10',
  },
  {
    name: 'Vue Js',
    numberPercent: '10',
    startCount: '0',
    category: 'Frontend',
    endCount: '10',
  }
];

const tabList = ['All', 'Frontend', 'Backend'];

const Skills = () => {
  const [focus, setFocus] = React.useState(false);
  const [activeTab, setActiveTab] = useState('All');
  const [showMore, setShowMore] = useState(false);

  // Function to filter and sort skills by category and percentage
  const getFilteredSkills = (showAll = false) => {
    const filtered = skillContent
      .filter(skill => activeTab === 'All' || skill.category === activeTab)
      .sort((a, b) => Number(b.numberPercent) - Number(a.numberPercent));

    return showAll ? filtered : filtered.slice(0, 4);
  };

  const filteredSkills = skillContent.filter(skill => activeTab === 'All'
    || skill.category === activeTab);
  const displayedSkills = showMore ? filteredSkills : filteredSkills.slice(0, 4);


  return (
    <>
      <Tabs>
        <TabList>
          <Tab onClick={() => setActiveTab('All')}>All</Tab>
          <Tab onClick={() => setActiveTab('Frontend')}>Frontend</Tab>
          <Tab onClick={() => setActiveTab('Backend')}>Backend</Tab>
        </TabList>
        {tabList.map((category, index) => (
          <TabPanel key={category}>
            <div className="skill-wrapper">
              {displayedSkills.map((skill, i) => (
                <div className="skill-lt" key={i}>
                  <h6>{skill.name}</h6>
                  <span className="count-inner">
                    {skill.endCount}%
                  </span>
                  <div className="skill-bar">
                    <div
                      className="skill-bar-in"
                      style={{ width: skill.numberPercent + '%' }}
                    ></div>
                  </div>
                </div>
                // End skill-lt
              ))}
              {filteredSkills.length > 4 && (
                <button onClick={() => setShowMore(!showMore)} className="show-more-button">
                  {showMore ? 'Show Less' : 'Show More'}
                </button>
              )}
            </div>
          </TabPanel>
        ))}
      </Tabs>
    </>
  );
};

export default Skills;
