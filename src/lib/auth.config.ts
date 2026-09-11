import type { NextAuthConfig } from "next-auth";

// Edge-safe auth config (no Prisma, no bcrypt) — used by middleware.
// The full config with the Credentials provider lives in auth.ts.
// Idle timeout: session expires after 10 minutes of inactivity.
// lastActivity is refreshed on each request by the middleware; if a request
// arrives more than IDLE_MS after the last one, the token is invalidated.
export const IDLE_MS = 10 * 60 * 1000;

export const authConfig: NextAuthConfig = {
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  pages: { signIn: "/login" },
  trustHost: true,
  providers: [],
  callbacks: {
    async jwt({ token, user }) {
      const now = Date.now();
      if (user) {
        (token as any).id = (user as any).id;
        (token as any).role = (user as any).role;
        (token as any).linkedClientId = (user as any).linkedClientId;
        (token as any).lastActivity = now;
        return token;
      }
      // Idle check on subsequent requests
      const last = (token as any).lastActivity as number | undefined;
      if (last && now - last > IDLE_MS) {
        // Invalidate: strip identity so session callback yields no user
        delete (token as any).id;
        delete (token as any).role;
        delete (token as any).linkedClientId;
        delete (token as any).lastActivity;
        return token;
      }
      (token as any).lastActivity = now;
      return token;
    },
    async session({ session, token }) {
      if (token && session.user && (token as any).id) {
        (session.user as any).id = (token as any).id;
        (session.user as any).role = (token as any).role;
        (session.user as any).linkedClientId = (token as any).linkedClientId;
      } else if (session.user) {
        // Token was invalidated (idle timeout) — clear the session user
        (session as any).user = undefined;
      }
      return session;
    },
  },
};
