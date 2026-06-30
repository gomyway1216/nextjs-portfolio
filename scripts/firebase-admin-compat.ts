/* eslint-disable @typescript-eslint/no-namespace */
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
  has(_target, property) {
    return property in getApps();
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

export function firestore(targetApp?: FirebaseApp): FirestoreType {
  return targetApp ? getFirestore(targetApp) : getFirestore();
}

export namespace firestore {
  export const FieldValue = FirestoreFieldValue;
  export type FieldValue = FirestoreFieldValue;
  export const Timestamp = FirestoreTimestamp;
  export type Timestamp = FirestoreTimestamp;
  export type Firestore = FirestoreType;
}

export function auth(targetApp?: FirebaseApp): AuthType {
  return targetApp ? getAuth(targetApp) : getAuth();
}

export namespace auth {
  export type Auth = AuthType;
}

export function storage(targetApp?: FirebaseApp): StorageType {
  return targetApp ? getStorage(targetApp) : getStorage();
}

export namespace storage {
  export type Storage = StorageType;
}

export function database(targetApp?: FirebaseApp): DatabaseType {
  return targetApp ? getDatabase(targetApp) : getDatabase();
}

export namespace database {
  export type Database = DatabaseType;
}
