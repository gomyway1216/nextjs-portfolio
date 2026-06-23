import type { FirebaseOptions } from 'firebase/app';

const DEFAULT_FIREBASE_PROJECT_ID = 'yudai-portfolio';

function firstConfiguredValue(...values: Array<string | undefined>): string | undefined {
  return values.find((value): value is string => typeof value === 'string' && value.trim().length > 0)?.trim();
}

export const firebaseClientConfig: FirebaseOptions = {
  apiKey: firstConfiguredValue(
    process.env.NEXT_PUBLIC_API_KEY,
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  ),
  authDomain: firstConfiguredValue(
    process.env.NEXT_PUBLIC_AUTH_DOMAIN,
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  ) ?? `${DEFAULT_FIREBASE_PROJECT_ID}.firebaseapp.com`,
  projectId: firstConfiguredValue(
    process.env.NEXT_PUBLIC_PROJECT_ID,
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  ) ?? DEFAULT_FIREBASE_PROJECT_ID,
  storageBucket: firstConfiguredValue(
    process.env.NEXT_PUBLIC_STORAGE_BUCKET,
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  ) ?? `${DEFAULT_FIREBASE_PROJECT_ID}.appspot.com`,
  messagingSenderId: firstConfiguredValue(
    process.env.NEXT_PUBLIC_MESSAGING_SENDER_ID,
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  ),
  appId: firstConfiguredValue(
    process.env.NEXT_PUBLIC_APP_ID,
    process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  ),
  databaseURL: firstConfiguredValue(
    process.env.NEXT_PUBLIC_DATABASE_URL,
    process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  ) ?? `https://${DEFAULT_FIREBASE_PROJECT_ID}-default-rtdb.firebaseio.com`,
};

const requiredFirebaseConfig = [
  firebaseClientConfig.apiKey,
  firebaseClientConfig.authDomain,
  firebaseClientConfig.projectId,
  firebaseClientConfig.appId,
];

export const isFirebaseClientConfigured = requiredFirebaseConfig.every(
  (value) => typeof value === 'string' && value.trim().length > 0,
);
