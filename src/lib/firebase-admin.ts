import * as admin from 'firebase-admin';

// Initialize Firebase Admin SDK
let app: admin.app.App;
let db: admin.firestore.Firestore;
let auth: admin.auth.Auth;
let storage: admin.storage.Storage;
let realtimeDb: admin.database.Database;

const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build';

function assertRuntimePhase() {
  if (isBuildPhase) {
    throw new Error('[Firebase Admin] Initialization attempted during build phase');
  }
}

function parseServiceAccountKey(serviceAccount: string): admin.ServiceAccount {
  const trimmed = serviceAccount.trim();
  const json = trimmed.startsWith('{')
    ? trimmed
    : Buffer.from(trimmed, 'base64').toString('utf8');
  return JSON.parse(json) as admin.ServiceAccount;
}

export function getAdminSDK() {
  if (!app) {
    try {
      assertRuntimePhase();
      // Check if already initialized
      if (admin.apps.length > 0 && admin.apps[0]) {
        console.log('[Firebase Admin] Using existing initialized app');
        app = admin.apps[0];
        db = admin.firestore(app);
        auth = admin.auth(app);
        storage = admin.storage(app);
        realtimeDb = admin.database(app);
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
        app = admin.initializeApp({
          credential: admin.credential.cert(parseServiceAccountKey(serviceAccount)),
          projectId: projectId,
          storageBucket: process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_STORAGE_BUCKET,
          databaseURL,
        });
      } else if (privateKey && clientEmail && projectId) {
        // Use individual environment variables (for development)
        console.log('[Firebase Admin] Using individual environment variables');
        app = admin.initializeApp({
          credential: admin.credential.cert({
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
        app = admin.initializeApp({
          projectId: projectId,
          storageBucket: process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_STORAGE_BUCKET,
          databaseURL,
        });
      }

      db = admin.firestore();
      auth = admin.auth();
      storage = admin.storage();
      realtimeDb = admin.database();
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
  return admin.firestore.FieldValue.serverTimestamp();
}
