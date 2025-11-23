'use client';

import React, { createContext, useEffect, useContext, useState, ReactNode } from 'react';
import { auth, signInWithEmail, signOutUser }
  from '@/lib/firebaseConnect';

interface AuthProviderProps {
  children: ReactNode;
}

const AuthContext = createContext<any>(undefined);

export const useAuth = () => {
  return useContext(AuthContext);
};

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [currentUser, setCurrentUser] = useState<any>();
  const [loading, setLoading] = useState<boolean>(true);

  const signIn = (email: string, password: string) => {
    return signInWithEmail(email, password);
  };

  const signOut = () => {
    signOutUser();
  };

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user: any) => {
      setCurrentUser(user);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const value = {
    currentUser,
    signIn,
    signOut
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
