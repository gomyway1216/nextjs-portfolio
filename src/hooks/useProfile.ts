'use client';

import { useState, useEffect } from 'react';
import * as api from '@/services/profileService';

export interface Profile {
  id: string;
  birthdate: string;
  location: string;
  email: string;
  languages: string[];
  bioEn?: string;
  bioJa?: string;
}

/**
 * Hook to fetch resume link
 */
export function useResumeLink() {
  const [resumeLink, setResumeLink] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const fetchResumeLink = async () => {
      try {
        setLoading(true);
        setError(null);
        const link = await api.getResumeLink();
        setResumeLink(link);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch resume link'));
      } finally {
        setLoading(false);
      }
    };

    fetchResumeLink();
  }, []);

  return { resumeLink, loading, error };
}

/**
 * Hook to fetch profile data
 */
export function useProfile() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch('/api/profile');

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        setProfile(data.profile);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch profile'));
        console.error('Error fetching profile:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, []);

  return { profile, loading, error };
}

/**
 * Function to update profile
 */
export async function updateProfile(profileData: Partial<Omit<Profile, 'id'>>) {
  const response = await fetch('/api/profile', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(profileData),
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return response.json();
}
