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
      /** Server-side session (auth_sessions.id); missing on older tokens, which are rejected. */
      sessionId?: string;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    /** Session version at sign-in; compared with users.session_version on every request. */
    sv?: number;
    /** auth_sessions.id created at sign-in; the row must exist on every request. */
    sid?: string;
  }
}
