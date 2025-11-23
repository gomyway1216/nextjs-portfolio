'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const AdminPage = () => {
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingJob, setEditingJob] = useState<string | null>(null);
  const [techInput, setTechInput] = useState<string>('');

  useEffect(() => {
    fetchJobs();
  }, []);

  const fetchJobs = async () => {
    try {
      const response = await fetch('/api/job');
      const data = await response.json();
      setJobs(data.jobs);
    } catch (error) {
      console.error('Error fetching jobs:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateTechnologies = async (jobId: string, companyName: string) => {
    const techArray = techInput.split(',').map(t => t.trim()).filter(t => t);

    try {
      const response = await fetch('/api/job', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName,
          technologies: techArray,
        }),
      });

      if (response.ok) {
        alert(`Updated technologies for ${companyName}`);
        setEditingJob(null);
        setTechInput('');
        fetchJobs(); // Refresh
      } else {
        const error = await response.json();
        alert(`Failed: ${error.error}`);
      }
    } catch (error) {
      alert(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  if (loading) return <div className='mt-20 text-center'>Loading...</div>;

  return (
    <div className='admin max-w-6xl mx-auto mt-20 p-6'>
      <h1 className='text-3xl font-bold mb-6'>Job Technologies Manager</h1>

      <div className='space-y-4'>
        {jobs.map((job) => (
          <div key={job.id} className='bg-white p-4 rounded-lg shadow-md'>
            <div className='flex justify-between items-start mb-2'>
              <div>
                <h3 className='font-bold text-lg'>{job.jobPosition}</h3>
                <p className='text-gray-600'>{job.companyName}</p>
                <p className='text-sm text-gray-500'>{job.jobDuration}</p>
              </div>
              <Button
                onClick={() => {
                  setEditingJob(job.id);
                  setTechInput(job.technologies?.join(', ') || '');
                }}
                size="sm"
              >
                Edit Tech
              </Button>
            </div>

            <div className='mt-2'>
              <strong className='text-sm'>Current Technologies:</strong>
              <div className='flex flex-wrap gap-2 mt-1'>
                {job.technologies?.length > 0 ? (
                  job.technologies.map((tech: string, i: number) => (
                    <span key={i} className='bg-sky-500 text-white text-xs px-2 py-1 rounded'>
                      {tech}
                    </span>
                  ))
                ) : (
                  <span className='text-gray-400 text-sm'>No technologies set</span>
                )}
              </div>
            </div>

            {editingJob === job.id && (
              <div className='mt-3 p-3 bg-gray-50 rounded'>
                <Input
                  value={techInput}
                  onChange={(e) => setTechInput(e.target.value)}
                  placeholder="Enter technologies separated by commas (e.g., React, TypeScript, Node.js)"
                  className='mb-2'
                />
                <div className='flex gap-2'>
                  <Button
                    onClick={() => handleUpdateTechnologies(job.id, job.companyName)}
                    size="sm"
                  >
                    Save
                  </Button>
                  <Button
                    onClick={() => {
                      setEditingJob(null);
                      setTechInput('');
                    }}
                    variant="outline"
                    size="sm"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default AdminPage;