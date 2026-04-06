import type { NextAuthConfig } from "next-auth";

// Edge-safe auth config (no Prisma, no bcrypt) — used by middleware.
// The full config with the Credentials provider lives in auth.ts.
export const authConfig: NextAuthConfig = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  trustHost: true,
  providers: [],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        (token as any).id = (user as any).id;
        (token as any).role = (user as any).role;
        (token as any).linkedClientId = (user as any).linkedClientId;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        (session.user as any).id = (token as any).id;
        (session.user as any).role = (token as any).role;
        (session.user as any).linkedClientId = (token as any).linkedClientId;
      }
      return session;
    },
  },
};
