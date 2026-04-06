import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

/** Require a logged-in session; redirect to /login otherwise. */
export async function requireSession() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return session;
}

/**
 * Return the where-clause to scope Client queries by role:
 *  - superadmin: no filter (all)
 *  - admin: only own
 *  - client: only their linked client
 */
export async function scopedClientWhere() {
  const session = await requireSession();
  const { role, id, linkedClientId } = session.user;
  if (role === "superadmin") return { deletedAt: null };
  if (role === "admin") return { adminId: id, deletedAt: null };
  if (role === "client") return { id: linkedClientId || "__none__", deletedAt: null };
  return { id: "__none__" };
}

/** Fetch a client by id, enforcing the caller's role scope. */
export async function getAuthorizedClient(clientId: string) {
  const where = await scopedClientWhere();
  return prisma.client.findFirst({
    where: { ...where, id: clientId },
    include: { admin: true },
  });
}
