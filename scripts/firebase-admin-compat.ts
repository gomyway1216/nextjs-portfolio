import {
  cert,
  getApp,
  getApps,
  initializeApp as initializeFirebaseApp,
  type App as FirebaseApp,
  type AppOptions,
  type ServiceAccount,
} from 'firebase-admin/app';
import {
  FieldValue as FirestoreFieldValue,
  getFirestore,
  Timestamp as FirestoreTimestamp,
  type Firestore as FirestoreType,
} from 'firebase-admin/firestore';
import { getAuth, type Auth as AuthType } from 'firebase-admin/auth';
import { getStorage, type Storage as StorageType } from 'firebase-admin/storage';
import { getDatabase, type Database as DatabaseType } from 'firebase-admin/database';

export type { AppOptions, ServiceAccount };
export type Firestore = FirestoreType;
export type Timestamp = FirestoreTimestamp;
export type Auth = AuthType;
export type Storage = StorageType;
export type Database = DatabaseType;

export const apps = new Proxy([] as FirebaseApp[], {
  get(_target, property, receiver) {
    return Reflect.get(getApps(), property, receiver);
  },
  getOwnPropertyDescriptor(_target, property) {
    return Object.getOwnPropertyDescriptor(getApps(), property);
  },
  has(_target, property) {
    return property in getApps();
  },
  ownKeys() {
    return Reflect.ownKeys(getApps());
  },
});

export function app(): FirebaseApp {
  return getApp();
}

export function initializeApp(options?: AppOptions): FirebaseApp {
  return initializeFirebaseApp(options);
}

export const credential = {
  cert,
};

function getCompatFirestore(targetApp?: FirebaseApp): FirestoreType {
  return targetApp ? getFirestore(targetApp) : getFirestore();
}

export const firestore = Object.assign(getCompatFirestore, {
  FieldValue: FirestoreFieldValue,
  Timestamp: FirestoreTimestamp,
});

export function auth(targetApp?: FirebaseApp): AuthType {
  return targetApp ? getAuth(targetApp) : getAuth();
}

export function storage(targetApp?: FirebaseApp): StorageType {
  return targetApp ? getStorage(targetApp) : getStorage();
}

export function database(targetApp?: FirebaseApp): DatabaseType {
  return targetApp ? getDatabase(targetApp) : getDatabase();
}
