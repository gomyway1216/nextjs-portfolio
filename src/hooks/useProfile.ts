'use client';

import { useCallback, useState, useEffect } from 'react';
import * as api from '@/services/profileService';
import { auth } from '@/lib/firebaseConnect';

export interface Profile {
  id: string;
  birthdate: string;
  location: string;
  email: string;
  languages: string[];
  bioEn?: string;
  bioJa?: string;
  profileImageUrl?: string;
}

let profileCache: Profile | null = null;
let profileRequest: Promise<Profile> | null = null;

function primeProfileCache(profile: Profile | null | undefined) {
  if (profile !== undefined) {
    profileCache = profile;
  }
}

async function fetchProfileFromApi(force = false): Promise<Profile> {
  if (!force && profileCache) return profileCache;
  if (!force && profileRequest) return profileRequest;

  profileRequest = (async () => {
    const response = await fetch('/api/profile');

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    profileCache = data.profile;
    return data.profile;
  })();

  try {
    return await profileRequest;
  } finally {
    profileRequest = null;
  }
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
export function useProfile(initialProfile?: Profile | null) {
  const hasInitialProfile = initialProfile !== undefined;
  const initialProfileState = hasInitialProfile ? initialProfile : profileCache;
  const [profile, setProfile] = useState<Profile | null>(initialProfileState);
  const [loading, setLoading] = useState(hasInitialProfile ? initialProfile === null : !profileCache);
  const [error, setError] = useState<Error | null>(null);

  const fetchProfile = useCallback(async (force = false) => {
    try {
      if (!force && profileCache) {
        setProfile(profileCache);
        setLoading(false);
        return profileCache;
      }

      setLoading(true);
      setError(null);
      const nextProfile = await fetchProfileFromApi(force);
      setProfile(nextProfile);
      return nextProfile;
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch profile'));
      console.error('Error fetching profile:', err);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialProfile !== undefined) {
      primeProfileCache(initialProfile);
      setProfile(initialProfile);
      if (initialProfile) {
        setLoading(false);
        return;
      }

      fetchProfile(true);
      return;
    }

    fetchProfile();
  }, [fetchProfile, initialProfile]);

  return { profile, loading, error, refetch: () => fetchProfile(true) };
}

/**
 * Function to update profile
 */
export async function updateProfile(profileData: Partial<Omit<Profile, 'id'>>) {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('You must be signed in to update the profile');
  }
  const token = await user.getIdToken();

  const response = await fetch('/api/profile', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(profileData),
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data = await response.json();
  profileCache = null;
  return data;
}
