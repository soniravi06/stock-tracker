import { requireSession } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/AppShell";
import { writeAudit } from "@/lib/audit";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";

async function createClientAction(formData: FormData) {
  "use server";
  const session = await requireSession();
  if (session.user.role === "client") redirect("/my");

  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim() || null;
  const phone = String(formData.get("phone") || "").trim() || null;
  const commissionType = String(formData.get("commissionType") || "percentage") as "percentage" | "flat";
  const commissionValue = parseFloat(String(formData.get("commissionValue") || "0"));
  const loginEmail = String(formData.get("loginEmail") || "").trim();
  const loginPassword = String(formData.get("loginPassword") || "");

  if (!name) return;

  // Determine owning admin. Admins always own their own clients.
  // Superadmin picks an admin from the form (act-as-admin); fall back to self.
  let adminId = session.user.id;
  if (session.user.role === "superadmin") {
    const chosen = String(formData.get("adminId") || "").trim();
    if (chosen) {
      const adminUser = await prisma.user.findFirst({
        where: { id: chosen, role: "admin", deletedAt: null },
      });
      if (adminUser) adminId = adminUser.id;
    }
  }

  const client = await prisma.client.create({
    data: {
      adminId,
      name,
      email,
      phone,
      defaultCommissionType: commissionType,
      defaultCommissionValue: commissionValue,
    },
  });

  await writeAudit({
    actorUserId: session.user.id,
    actorRole: session.user.role,
    action: "create",
    entityType: "Client",
    entityId: client.id,
    after: client,
  });

  // Optional client login creation
  if (loginEmail && loginPassword) {
    const existing = await prisma.user.findUnique({ where: { email: loginEmail } });
    if (!existing) {
      const hash = await bcrypt.hash(loginPassword, 10);
      const u = await prisma.user.create({
        data: {
          email: loginEmail,
          passwordHash: hash,
          role: "client",
          name,
          linkedClientId: client.id,
        },
      });
      await writeAudit({
        actorUserId: session.user.id,
        actorRole: session.user.role,
        action: "create",
        entityType: "User",
        entityId: u.id,
        after: { email: u.email, role: u.role, linkedClientId: u.linkedClientId },
      });
    }
  }

  revalidatePath("/clients");
  revalidatePath("/dashboard");
  revalidatePath("/audit");
  redirect(`/clients/${client.id}`);
}

export default async function NewClientPage() {
  const session = await requireSession();
  if (session.user.role === "client") redirect("/my");

  // Superadmin can assign the new client to any admin (act-as-admin).
  const isSuper = session.user.role === "superadmin";
  const admins = isSuper
    ? await prisma.user.findMany({
        where: { role: "admin", deletedAt: null },
        select: { id: true, name: true, email: true },
        orderBy: { name: "asc" },
      })
    : [];

  return (
    <AppShell role={session.user.role} userName={session.user.name || session.user.email} currentPath="/clients">
      <div style={{ marginBottom: "2rem" }}>
        <h1 style={{ fontSize: "2rem", fontWeight: 700, letterSpacing: "-0.02em" }}>New Client</h1>
        <p style={{ color: "#9ca3af", marginTop: "0.5rem" }}>Create a client and optionally set up their login credentials.</p>
      </div>

      <form action={createClientAction} className="glass" style={{ padding: "2rem", maxWidth: 720, display: "flex", flexDirection: "column", gap: "1.25rem" }}>
        <h2 style={{ fontSize: "1rem", fontWeight: 600, color: "#a78bfa" }}>Client Details</h2>

        {isSuper && (
          <div>
            <label className="label">Assign to Admin *</label>
            <select className="select" name="adminId" required defaultValue="">
              <option value="" disabled>Select an admin…</option>
              {admins.map((a) => (
                <option key={a.id} value={a.id}>{a.name || a.email}</option>
              ))}
            </select>
            <p style={{ fontSize: "0.75rem", color: "#9ca3af", marginTop: "0.35rem" }}>
              As superadmin, choose which admin owns this client.
            </p>
          </div>
        )}

        <div>
          <label className="label">Name *</label>
          <input className="input" name="name" required placeholder="Amit Patel" />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
          <div>
            <label className="label">Email</label>
            <input className="input" type="email" name="email" placeholder="amit@example.com" />
          </div>
          <div>
            <label className="label">Phone</label>
            <input className="input" name="phone" placeholder="+91 ..." />
          </div>
        </div>

        <h2 style={{ fontSize: "1rem", fontWeight: 600, color: "#a78bfa", marginTop: "0.5rem" }}>Default Commission</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
          <div>
            <label className="label">Type</label>
            <select className="select" name="commissionType" defaultValue="percentage">
              <option value="percentage">Percentage (%)</option>
              <option value="flat">Flat (₹)</option>
            </select>
          </div>
          <div>
            <label className="label">Value</label>
            <input className="input" type="number" name="commissionValue" step="0.01" defaultValue="0.5" />
          </div>
        </div>

        <h2 style={{ fontSize: "1rem", fontWeight: 600, color: "#a78bfa", marginTop: "0.5rem" }}>
          Client Login (optional)
        </h2>
        <p style={{ fontSize: "0.8rem", color: "#9ca3af", marginTop: "-0.5rem" }}>
          Create read-only credentials so the client can log in and view their own book.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
          <div>
            <label className="label">Login Email</label>
            <input className="input" type="email" name="loginEmail" placeholder="amit@example.com" />
          </div>
          <div>
            <label className="label">Temporary Password</label>
            <input className="input" type="text" name="loginPassword" placeholder="min 8 chars" />
          </div>
        </div>

        <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem" }}>
          <button type="submit" className="btn btn-primary">Create Client</button>
        </div>
      </form>
    </AppShell>
  );
}
