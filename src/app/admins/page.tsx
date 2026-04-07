import { requireSession } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/AppShell";
import { writeAudit } from "@/lib/audit";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { fmtDate } from "@/lib/format";

async function createAdminAction(formData: FormData) {
  "use server";
  const session = await requireSession();
  if (session.user.role !== "superadmin") redirect("/dashboard");

  const email = String(formData.get("email") || "").toLowerCase().trim();
  const name = String(formData.get("name") || "").trim();
  const password = String(formData.get("password") || "");
  if (!email || !password || password.length < 6) return;

  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) return;

  const u = await prisma.user.create({
    data: {
      email,
      name,
      passwordHash: await bcrypt.hash(password, 10),
      role: "admin",
    },
  });

  await writeAudit({
    actorUserId: session.user.id,
    actorRole: "superadmin",
    action: "create",
    entityType: "User",
    entityId: u.id,
    after: { email: u.email, role: u.role, name: u.name },
  });

  revalidatePath("/admins");
  revalidatePath("/dashboard");
  revalidatePath("/audit");
  redirect("/admins");
}

export default async function AdminsPage() {
  const session = await requireSession();
  if (session.user.role !== "superadmin") redirect("/dashboard");

  const admins = await prisma.user.findMany({
    where: { role: "admin", deletedAt: null },
    include: { _count: { select: { clientsOwned: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <AppShell role="superadmin" userName={session.user.name || session.user.email} currentPath="/admins">
      <div style={{ marginBottom: "2rem" }}>
        <div style={{ fontSize: "0.75rem", color: "#7c5cff", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "0.5rem" }}>
          Administrators
        </div>
        <h1 style={{ fontSize: "2rem", fontWeight: 700, letterSpacing: "-0.02em" }}>Admins</h1>
      </div>

      <div className="glass" style={{ padding: "2rem", marginBottom: "2rem", maxWidth: 720 }}>
        <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1rem", color: "#a78bfa" }}>Create New Admin</h2>
        <form action={createAdminAction} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <div>
              <label className="label">Name</label>
              <input className="input" name="name" placeholder="Rajesh Sharma" />
            </div>
            <div>
              <label className="label">Email *</label>
              <input className="input" type="email" name="email" required />
            </div>
          </div>
          <div>
            <label className="label">Temporary Password *</label>
            <input className="input" type="text" name="password" required minLength={6} />
          </div>
          <button type="submit" className="btn btn-primary" style={{ alignSelf: "flex-start" }}>+ Create Admin</button>
        </form>
      </div>

      <div className="glass" style={{ overflow: "hidden" }}>
        <table className="data">
          <thead>
            <tr>
              <th>Name</th><th>Email</th><th>Clients</th><th>Created</th>
            </tr>
          </thead>
          <tbody>
            {admins.length === 0 && (
              <tr><td colSpan={4} style={{ textAlign: "center", color: "#9ca3af", padding: "2rem" }}>No admins yet.</td></tr>
            )}
            {admins.map((a) => (
              <tr key={a.id}>
                <td style={{ fontWeight: 600 }}>{a.name || "—"}</td>
                <td>{a.email}</td>
                <td>{a._count.clientsOwned}</td>
                <td style={{ color: "#9ca3af", fontSize: "0.8rem" }}>{fmtDate(a.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
