/**
 * Firebase Realtime Database Client
 * Provides client-side access to Firebase Realtime Database for multiplayer games
 */

'use client';

import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getDatabase, ref, onValue, off, set, Database, DataSnapshot } from 'firebase/database';
import { ensureGameSignIn } from '@/lib/gameAuth';
import { firebaseClientConfig } from '@/lib/firebaseConfig';

// Singleton instances
let app: FirebaseApp | null = null;
let database: Database | null = null;

/**
 * Get or initialize Firebase App
 */
export function getFirebaseApp(): FirebaseApp {
  if (!app) {
    const apps = getApps();
    app = apps.length > 0 ? apps[0] : initializeApp(firebaseClientConfig);
  }
  return app;
}

/**
 * Get or initialize Firebase Realtime Database
 */
export function getFirebaseDatabase(): Database {
  if (!database) {
    database = firebaseClientConfig.databaseURL
      ? getDatabase(getFirebaseApp(), firebaseClientConfig.databaseURL)
      : getDatabase(getFirebaseApp());
  }
  return database;
}

/**
 * Subscribe to a database path
 * Returns an unsubscribe function
 */
export function subscribeToPath<T>(
  path: string,
  callback: (data: T | null) => void
): () => void {
  const db = getFirebaseDatabase();
  const pathRef = ref(db, path);

  const handler = (snapshot: DataSnapshot) => {
    callback(snapshot.val() as T | null);
  };

  onValue(pathRef, handler);

  return () => {
    off(pathRef);
  };
}

/**
 * Set data at a database path
 */
export async function setData<T>(path: string, data: T): Promise<void> {
  // RTDB writes require an authenticated user (anonymous is fine) since
  // the Phase 2 rules change; reads stay open.
  await ensureGameSignIn();
  const db = getFirebaseDatabase();
  await set(ref(db, path), data);
}

/**
 * Get database reference for direct operations
 */
export function getDatabaseRef(path: string) {
  const db = getFirebaseDatabase();
  return ref(db, path);
}
