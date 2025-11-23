import * as admin from 'firebase-admin';

// Initialize Firebase Admin SDK
let app: admin.app.App;
let db: admin.firestore.Firestore;
let auth: admin.auth.Auth;
let storage: admin.storage.Storage;

export function getAdminSDK() {
  if (!app) {
    try {
      // Check if already initialized
      if (admin.apps.length > 0 && admin.apps[0]) {
        console.log('[Firebase Admin] Using existing initialized app');
        app = admin.apps[0];
        db = admin.firestore(app);
        auth = admin.auth(app);
        storage = admin.storage(app);
        return { app, db, auth, storage };
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

      if (serviceAccount) {
        // Use service account JSON (for production)
        console.log('[Firebase Admin] Using service account JSON');
        app = admin.initializeApp({
          credential: admin.credential.cert(JSON.parse(serviceAccount)),
          projectId: projectId,
          storageBucket: process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_STORAGE_BUCKET,
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
        });
      }

      db = admin.firestore();
      auth = admin.auth();
      storage = admin.storage();
      console.log('[Firebase Admin] Successfully initialized');
    } catch (error) {
      console.error('[Firebase Admin] Failed to initialize:', error);
      throw error;
    }
  }

  return { app, db, auth, storage };
}

export function getFirestore() {
  const { db } = getAdminSDK();
  return db;
}

export function getAuth() {
  const { auth } = getAdminSDK();
  return auth;
}

export function getStorage() {
  const { storage } = getAdminSDK();
  return storage;
}
