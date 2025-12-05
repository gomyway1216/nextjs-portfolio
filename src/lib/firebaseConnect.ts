import { initializeApp, getApps } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signOut, sendPasswordResetEmail, sendEmailVerification } from 'firebase/auth';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_APP_ID,
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const auth = getAuth(app);

export const signInWithEmail = (email: string, password: string) => {
  return signInWithEmailAndPassword(auth, email, password);
};

export const signOutUser = () => {
  return signOut(auth);
};

export const resetPassword = (email: string) => {
  return sendPasswordResetEmail(auth, email);
};

export const sendVerificationEmail = () => {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('No user signed in');
  }
  return sendEmailVerification(user);
};
