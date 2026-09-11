import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/lib/auth.config";
import { writeAudit } from "@/lib/audit";
import type { Role } from "@prisma/client";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      role: Role;
      linkedClientId?: string | null;
    };
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = String(credentials?.email || "").toLowerCase().trim();
        const password = String(credentials?.password || "");
        if (!email || !password) return null;

        const user = await prisma.user.findFirst({
          where: { email, deletedAt: null },
        });
        if (!user) {
          await writeAudit({
            actorUserId: null,
            actorRole: "client",
            action: "login_failed",
            entityType: "Auth",
            entityId: email,
            after: { email, reason: "no such user" },
          });
          return null;
        }

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) {
          await writeAudit({
            actorUserId: user.id,
            actorRole: user.role,
            action: "login_failed",
            entityType: "Auth",
            entityId: user.id,
            after: { email, reason: "wrong password" },
          });
          return null;
        }

        await writeAudit({
          actorUserId: user.id,
          actorRole: user.role,
          action: "login",
          entityType: "Auth",
          entityId: user.id,
          after: { email },
        });

        return {
          id: user.id,
          email: user.email,
          name: user.name ?? undefined,
          role: user.role,
          linkedClientId: user.linkedClientId,
        } as any;
      },
    }),
  ],
});
