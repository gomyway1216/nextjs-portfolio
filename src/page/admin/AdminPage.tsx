'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/providers/AuthProvider';
import { useProfile, updateProfile } from '@/hooks/useProfile';
import { useRouter } from 'next/navigation';

const AdminPage = () => {
  const { currentUser } = useAuth();
  const router = useRouter();
  const { profile, loading: profileLoading } = useProfile();

  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingJob, setEditingJob] = useState<string | null>(null);
  const [techInput, setTechInput] = useState<string>('');

  // Profile edit states
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileBirthdate, setProfileBirthdate] = useState('');
  const [profileLocation, setProfileLocation] = useState('');
  const [profileEmail, setProfileEmail] = useState('');
  const [profileLanguages, setProfileLanguages] = useState('');
  const [profileMessage, setProfileMessage] = useState('');

  useEffect(() => {
    // Redirect if not authenticated
    if (!currentUser) {
      router.push('/signin');
      return;
    }
    fetchJobs();
  }, [currentUser, router]);

  useEffect(() => {
    // Populate profile form when data loads
    if (profile) {
      setProfileBirthdate(profile.birthdate || '');
      setProfileLocation(profile.location || '');
      setProfileEmail(profile.email || '');
      setProfileLanguages(profile.languages?.join(', ') || '');
    }
  }, [profile]);

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

  const handleUpdateProfile = async () => {
    setProfileMessage('');
    try {
      const languagesArray = profileLanguages.split(',').map(l => l.trim()).filter(l => l);
      await updateProfile({
        birthdate: profileBirthdate,
        location: profileLocation,
        email: profileEmail,
        languages: languagesArray,
      });
      setProfileMessage('✅ Profile updated successfully!');
      setEditingProfile(false);
      // Refresh page to see updated data
      window.location.reload();
    } catch (error) {
      setProfileMessage(`❌ Failed to update profile: ${error instanceof Error ? error.message : 'Unknown error'}`);
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

  // Show loading while checking authentication
  if (!currentUser || loading || profileLoading) {
    return <div className='mt-20 text-center'>Loading...</div>;
  }

  return (
    <div className='admin max-w-6xl mx-auto mt-20 p-6'>
      <h1 className='text-3xl font-bold mb-8'>Admin Dashboard</h1>

      {/* Profile Edit Section */}
      <div className='bg-blue-50 border border-blue-200 p-6 rounded-lg shadow-md mb-8'>
        <div className='flex justify-between items-center mb-4'>
          <h2 className='text-xl font-semibold'>Profile Information</h2>
          <Button
            onClick={() => setEditingProfile(!editingProfile)}
            variant="outline"
            size="sm"
          >
            {editingProfile ? 'Cancel' : 'Edit Profile'}
          </Button>
        </div>

        {!editingProfile ? (
          // Display mode
          <div className='space-y-2 text-gray-700'>
            <p><strong>Birthdate:</strong> {profile?.birthdate || 'Not set'}</p>
            <p><strong>Location:</strong> {profile?.location || 'Not set'}</p>
            <p><strong>Email:</strong> {profile?.email || 'Not set'}</p>
            <p><strong>Languages:</strong> {profile?.languages?.join(', ') || 'Not set'}</p>
          </div>
        ) : (
          // Edit mode
          <div className='space-y-4'>
            <div>
              <Label htmlFor="birthdate">Birthdate (YYYY-MM-DD)</Label>
              <Input
                id="birthdate"
                type="date"
                value={profileBirthdate}
                onChange={(e) => setProfileBirthdate(e.target.value)}
                className='mt-1'
              />
            </div>
            <div>
              <Label htmlFor="location">Location</Label>
              <Input
                id="location"
                value={profileLocation}
                onChange={(e) => setProfileLocation(e.target.value)}
                placeholder="e.g., San Francisco, Remote"
                className='mt-1'
              />
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={profileEmail}
                onChange={(e) => setProfileEmail(e.target.value)}
                placeholder="your@email.com"
                className='mt-1'
              />
            </div>
            <div>
              <Label htmlFor="languages">Languages (comma-separated)</Label>
              <Input
                id="languages"
                value={profileLanguages}
                onChange={(e) => setProfileLanguages(e.target.value)}
                placeholder="English, Japanese"
                className='mt-1'
              />
            </div>
            <Button onClick={handleUpdateProfile} className='mt-2'>
              Save Profile
            </Button>
          </div>
        )}

        {profileMessage && (
          <div className={`mt-4 p-3 rounded ${
            profileMessage.includes('✅') ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
          }`}>
            {profileMessage}
          </div>
        )}
      </div>

      {/* Job Technologies Section */}
      <h2 className='text-2xl font-bold mb-4'>Job Technologies Manager</h2>
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