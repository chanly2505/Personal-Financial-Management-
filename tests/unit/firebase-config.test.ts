import { describe, expect, it } from "vitest";

import { firebaseOptionsFrom } from "@/lib/firebase/config";

const full = {
  NEXT_PUBLIC_FIREBASE_API_KEY: "key",
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "demo.firebaseapp.com",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo",
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: "demo.firebasestorage.app",
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "123",
  NEXT_PUBLIC_FIREBASE_APP_ID: "1:123:web:abc",
};

describe("firebaseOptionsFrom", () => {
  it("maps every configured value", () => {
    expect(firebaseOptionsFrom(full)).toEqual({
      apiKey: "key",
      authDomain: "demo.firebaseapp.com",
      projectId: "demo",
      storageBucket: "demo.firebasestorage.app",
      messagingSenderId: "123",
      appId: "1:123:web:abc",
    });
  });

  it("never configures Google Analytics", () => {
    expect(firebaseOptionsFrom(full)).not.toHaveProperty("measurementId");
  });

  it.each([
    "NEXT_PUBLIC_FIREBASE_API_KEY",
    "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
    "NEXT_PUBLIC_FIREBASE_APP_ID",
  ])("is disabled (null) without %s", (key) => {
    expect(firebaseOptionsFrom({ ...full, [key]: "  " })).toBeNull();
    expect(firebaseOptionsFrom({ ...full, [key]: undefined })).toBeNull();
  });

  it("omits optional values that are not set", () => {
    expect(
      firebaseOptionsFrom({
        NEXT_PUBLIC_FIREBASE_API_KEY: "key",
        NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo",
        NEXT_PUBLIC_FIREBASE_APP_ID: "app",
      }),
    ).toEqual({ apiKey: "key", projectId: "demo", appId: "app" });
  });
});
