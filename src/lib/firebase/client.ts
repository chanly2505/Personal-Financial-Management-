import { type FirebaseApp, getApp, getApps, initializeApp } from "firebase/app";

import { firebaseOptionsFrom, publicFirebaseEnv } from "./config";

/**
 * The browser's Firebase app, created once and reused (safe across hot reloads
 * and repeated calls). Returns null on the server and when Firebase is not
 * configured. Initializing makes no network requests by itself; individual
 * Firebase services (e.g. messaging) are added from here when they are built.
 */
export function getFirebaseApp(): FirebaseApp | null {
  if (typeof window === "undefined") return null;
  const options = firebaseOptionsFrom(publicFirebaseEnv());
  if (!options) return null;
  return getApps().length > 0 ? getApp() : initializeApp(options);
}
