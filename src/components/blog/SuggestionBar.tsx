'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';

interface SuggestionBarProps {
  activeTab?: string;
  setActiveTab?: (tab: string) => void;
}

const DEFAULT_OPTIONS = [
  { id: 0, title: 'All', url: '/blog/all' },
  { id: 1, title: 'Technology', url: '/blog/technology' },
  { id: 2, title: 'Life', url: '/blog/life' }
];

const SuggestionBar = ({ activeTab, setActiveTab }: SuggestionBarProps) => {
  const [options, setOptions] = useState(DEFAULT_OPTIONS);

  useEffect(() => {

  }, [activeTab]);

  return (
    <div
      className="hide_scroll"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 1000,
        // paddingTop: '20px',
        backgroundColor: '#FFFFFF',
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        height: '30px',
        borderBottom: 'solid 1px rgba(242, 242, 242, 1)',
        gap: '28px',
        width: '90%',
        marginRight: 'auto',
        paddingBottom: '8px',
        overflowX: 'auto',
      }}
    >
      <>
        {options.map((option) => {
          return (
            <Link
              href={`${option.url}`}
              onClick={() => setActiveTab?.(option.title.toLowerCase())}
              style={{
                textDecoration: 'none',
                color: activeTab === option.title ? 'black' : 'gray',
                fontSize: '14px',
                fontFamily: 'Questrial',
                whiteSpace: 'nowrap',
                borderBottom:
                  activeTab === option.title.toLowerCase() ? '2px solid black' : 'none',
                height: activeTab === option.title.toLowerCase() ? '94%' : '98%',
                zIndex: '99',
                padding: '0 2px',
              }}
              key={option.id}
            >
              {option.title}
            </Link>
          );
        })}
      </>
    </div>
  );
};

export default SuggestionBar;
