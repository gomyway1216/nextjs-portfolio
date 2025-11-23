'use client';

import React, { createContext, useEffect, useContext, useState } from 'react';
import PropTypes from 'prop-types';
import { auth, signInWithEmail, signOutUser }
  from '@/lib/firebaseConnect';

const AuthContext = createContext<any>(undefined);

export const useAuth = () => {
  return useContext(AuthContext);
};

export const AuthProvider = ({ children }: any) => {
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

AuthProvider.propTypes = {
  children: PropTypes.any
};
