import type { FirebaseOptions } from "firebase/app";

/**
 * Firebase web configuration. These values identify the Firebase project and
 * are public by design (they ship to every browser); access is controlled by
 * Firebase security rules, not by keeping them secret. They still come from
 * environment variables so each environment can point at its own project.
 *
 * Google Analytics is deliberately NOT configured: the PRD forbids third-party
 * analytics and trackers (docs/PRD.md §7, docs/SECURITY.md §9), so there is no
 * measurementId and getAnalytics() is never called.
 */
export interface PublicFirebaseEnv {
  NEXT_PUBLIC_FIREBASE_API_KEY?: string | undefined;
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?: string | undefined;
  NEXT_PUBLIC_FIREBASE_PROJECT_ID?: string | undefined;
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?: string | undefined;
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID?: string | undefined;
  NEXT_PUBLIC_FIREBASE_APP_ID?: string | undefined;
}

/** The values Next.js inlines at build time (each must be referenced literally). */
export function publicFirebaseEnv(): PublicFirebaseEnv {
  return {
    NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };
}

const clean = (value: string | undefined) => value?.trim() || undefined;

/**
 * Firebase options from the environment, or null when Firebase is not
 * configured (the app works fully without it). The three identifying values
 * are required; the rest are optional.
 */
export function firebaseOptionsFrom(env: PublicFirebaseEnv): FirebaseOptions | null {
  const apiKey = clean(env.NEXT_PUBLIC_FIREBASE_API_KEY);
  const projectId = clean(env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);
  const appId = clean(env.NEXT_PUBLIC_FIREBASE_APP_ID);
  if (!apiKey || !projectId || !appId) return null;
  const optional = {
    authDomain: clean(env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN),
    storageBucket: clean(env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET),
    messagingSenderId: clean(env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID),
  };
  return {
    apiKey,
    projectId,
    appId,
    ...Object.fromEntries(Object.entries(optional).filter(([, v]) => v !== undefined)),
  };
}
