import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface User {
    sessionVersion?: number;
  }
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      /** -1 when the token predates session versions (always rejected). */
      sessionVersion: number;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    /** Session version at sign-in; compared with users.session_version on every request. */
    sv?: number;
  }
}
