import {
  cert,
  getApps,
  initializeApp,
  type App,
} from 'firebase-admin/app';
import { getAuth as getAdminAuth, type Auth } from 'firebase-admin/auth';
import { getDatabase as getAdminDatabase, type Database } from 'firebase-admin/database';
import { FieldValue, getFirestore as getAdminFirestore, type Firestore } from 'firebase-admin/firestore';
import { getStorage as getAdminStorage, type Storage } from 'firebase-admin/storage';

// Initialize Firebase Admin SDK
let app: App;
let db: Firestore;
let auth: Auth;
let storage: Storage;
let realtimeDb: Database;

const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build';

function assertRuntimePhase() {
  if (isBuildPhase) {
    throw new Error('[Firebase Admin] Initialization attempted during build phase');
  }
}

export function getAdminSDK() {
  if (!app) {
    try {
      assertRuntimePhase();
      // Check if already initialized
      const existingApp = getApps()[0];
      if (existingApp) {
        console.log('[Firebase Admin] Using existing initialized app');
        app = existingApp;
        db = getAdminFirestore(app);
        auth = getAdminAuth(app);
        storage = getAdminStorage(app);
        realtimeDb = getAdminDatabase(app);
        return { app, db, auth, storage, realtimeDb };
      }

      // Check if we're running in an environment with service account credentials
      const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
      const privateKey = process.env.FIREBASE_PRIVATE_KEY;
      const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
      const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_PROJECT_ID;

      console.log('[Firebase Admin] Initializing with:', {
        hasServiceAccount: !!serviceAccount,
        hasPrivateKey: !!privateKey,
        hasClientEmail: !!clientEmail,
        projectId,
      });

      const databaseURL = process.env.FIREBASE_DATABASE_URL || 'https://yudai-portfolio-default-rtdb.firebaseio.com';

      if (serviceAccount) {
        // Use service account JSON (for production)
        console.log('[Firebase Admin] Using service account JSON');
        app = initializeApp({
          credential: cert(JSON.parse(serviceAccount)),
          projectId: projectId,
          storageBucket: process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_STORAGE_BUCKET,
          databaseURL,
        });
      } else if (privateKey && clientEmail && projectId) {
        // Use individual environment variables (for development)
        console.log('[Firebase Admin] Using individual environment variables');
        app = initializeApp({
          credential: cert({
            projectId: projectId,
            clientEmail: clientEmail,
            privateKey: privateKey.replace(/\\n/g, '\n'),
          }),
          projectId: projectId,
          storageBucket: process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_STORAGE_BUCKET,
          databaseURL,
        });
      } else {
        // Use default credentials (for development with gcloud CLI)
        console.log('[Firebase Admin] Using default credentials');
        if (!projectId) {
          throw new Error('Firebase projectId is required but not found in environment variables');
        }
        app = initializeApp({
          projectId: projectId,
          storageBucket: process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_STORAGE_BUCKET,
          databaseURL,
        });
      }

      db = getAdminFirestore(app);
      auth = getAdminAuth(app);
      storage = getAdminStorage(app);
      realtimeDb = getAdminDatabase(app);
      console.log('[Firebase Admin] Successfully initialized');
    } catch (error) {
      console.error('[Firebase Admin] Failed to initialize:', error);
      throw error;
    }
  }

  return { app, db, auth, storage, realtimeDb };
}

export function getFirestore() {
  assertRuntimePhase();
  const { db } = getAdminSDK();
  return db;
}

export function getAuth() {
  assertRuntimePhase();
  const { auth } = getAdminSDK();
  return auth;
}

export function getStorage() {
  assertRuntimePhase();
  const { storage } = getAdminSDK();
  return storage;
}

export function getRealtimeDatabase() {
  assertRuntimePhase();
  const { realtimeDb } = getAdminSDK();
  return realtimeDb;
}

export function getServerTimestamp() {
  assertRuntimePhase();
  getAdminSDK();
  return FieldValue.serverTimestamp();
}
