'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/providers/AuthProvider';
import { getFunctions, httpsCallable, connectFunctionsEmulator } from 'firebase/functions';

const AchievementStatus = {
  NOT_STARTED: 'NOT_STARTED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED'
} as const;

type AchievementStatusValue = typeof AchievementStatus[keyof typeof AchievementStatus];

interface Achievement {
  id: string;
  text: string;
  status: AchievementStatusValue;
  imageLink?: string;
}

type AchievementsByDate = Record<string, Achievement[]>;

interface NewAchievement {
  text: string;
  status: AchievementStatusValue;
  imageLink: string;
}

const AchievementManagementPage = () => {
  const { currentUser } = useAuth();
  const [achievements, setAchievements] = useState<AchievementsByDate>({});
  const [newAchievement, setNewAchievement] = useState<NewAchievement>({
    text: '',
    status: AchievementStatus.NOT_STARTED,
    imageLink: ''
  });

  const functions = getFunctions();

  // Connect to emulator if in development mode
  if (process.env.NODE_ENV === 'development') {
    console.log('Connecting to emulator');
    connectFunctionsEmulator(functions, 'localhost', 5001);
  }

  useEffect(() => {
    if (currentUser) {
      fetchAchievements();
    }
  }, [currentUser]);

  const fetchAchievements = async () => {
    try {
      const getAchievements = httpsCallable(functions, 'getAchievementsGroupedByDate');
      const result = await getAchievements();
      setAchievements(result.data as AchievementsByDate);
    } catch (error) {
      console.error('Error fetching achievements:', error);
    }
  };

  const createAchievement = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      const createAchievementFunction = httpsCallable(functions, 'createAchievement');
      await createAchievementFunction(newAchievement);
      setNewAchievement({ text: '', status: AchievementStatus.NOT_STARTED, imageLink: '' });
      fetchAchievements();
    } catch (error) {
      console.error('Error creating achievement:', error);
    }
  };

  if (!currentUser || currentUser.isAnonymous) {
    return <div>Please sign in to manage your achievements.</div>;
  }

  return (
    <div>
      <h1>Achievement Manager</h1>
      <h2>Create New Achievement</h2>
      <form onSubmit={createAchievement}>
        <input
          type="text"
          value={newAchievement.text}
          onChange={(e) => setNewAchievement({ ...newAchievement, text: e.target.value })}
          placeholder="Achievement text"
          required
        />
        <input
          type="text"
          value={newAchievement.imageLink}
          onChange={(e) => setNewAchievement({ ...newAchievement, imageLink: e.target.value })}
          placeholder="Image link (optional)"
        />
        <select
          value={newAchievement.status}
          onChange={(e) => setNewAchievement({ ...newAchievement, status: e.target.value as AchievementStatusValue })}
          required
        >
          {Object.values(AchievementStatus).map((status) => (
            <option key={status} value={status}>{status}</option>
          ))}
        </select>
        <button type="submit">Create Achievement</button>
      </form>

      <h2>Your Achievements</h2>
      {Object.entries(achievements).map(([date, dailyAchievements]) => (
        <div key={date}>
          <h3>{date}</h3>
          <ul>
            {dailyAchievements.map((achievement) => (
              <li key={achievement.id}>
                {achievement.text} - {achievement.status}
                {achievement.imageLink && <img src={achievement.imageLink}
                  alt="Achievement" style={{ maxWidth: '100px' }} />}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
};

export default AchievementManagementPage;
