"use client";

import { useEffect } from "react";

import { getFirebaseApp } from "@/lib/firebase/client";

/** Initializes Firebase once in the browser. Renders nothing. */
export function FirebaseInit() {
  useEffect(() => {
    getFirebaseApp();
  }, []);
  return null;
}
