/* eslint-disable @typescript-eslint/no-namespace */
import {
  applicationDefault,
  cert,
  getApp,
  getApps,
  initializeApp as initializeFirebaseApp,
  refreshToken,
  type App as FirebaseApp,
  type AppOptions,
} from 'firebase-admin/app';
import { getAuth, type Auth as FirebaseAuth } from 'firebase-admin/auth';
import { getDatabase, type Database as FirebaseDatabase } from 'firebase-admin/database';
import {
  FieldValue as FirestoreFieldValue,
  Timestamp as FirestoreTimestamp,
  getFirestore,
  type Firestore as FirebaseFirestore,
} from 'firebase-admin/firestore';
import { getStorage, type Storage as FirebaseStorage } from 'firebase-admin/storage';

export type { AppOptions, ServiceAccount } from 'firebase-admin/app';

export const apps = new Proxy([] as FirebaseApp[], {
  get(_target, property) {
    const currentApps = getApps();

    if (property === 'length') {
      return currentApps.length;
    }

    if (property === Symbol.iterator) {
      return currentApps[Symbol.iterator].bind(currentApps);
    }

    if (typeof property === 'string' && /^\d+$/.test(property)) {
      return currentApps[Number(property)];
    }

    const value = Reflect.get(currentApps, property);
    return typeof value === 'function' ? value.bind(currentApps) : value;
  },
}) as FirebaseApp[];

export const credential = {
  applicationDefault,
  cert,
  refreshToken,
};

export function initializeApp(options?: AppOptions, appName?: string): FirebaseApp {
  return initializeFirebaseApp(options, appName);
}

export function app(appName?: string): FirebaseApp {
  return getApp(appName);
}

export namespace app {
  export type App = FirebaseApp;
}

export function firestore(app?: FirebaseApp): FirebaseFirestore {
  return app ? getFirestore(app) : getFirestore();
}

export namespace firestore {
  export const FieldValue = FirestoreFieldValue;
  export const Timestamp = FirestoreTimestamp;
  export type Firestore = FirebaseFirestore;
  export type Timestamp = FirestoreTimestamp;
}

export function storage(app?: FirebaseApp): FirebaseStorage {
  return app ? getStorage(app) : getStorage();
}

export namespace storage {
  export type Storage = FirebaseStorage;
}

export function auth(app?: FirebaseApp): FirebaseAuth {
  return app ? getAuth(app) : getAuth();
}

export namespace auth {
  export type Auth = FirebaseAuth;
}

export function database(app?: FirebaseApp): FirebaseDatabase {
  return app ? getDatabase(app) : getDatabase();
}

export namespace database {
  export type Database = FirebaseDatabase;
}
