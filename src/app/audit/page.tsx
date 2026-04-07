import { requireSession } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/AppShell";
import { AuditLogTable } from "@/components/AuditLogTable";

export default async function AuditPage() {
  const session = await requireSession();

  // Scope: superadmin sees all, admin sees own + entries affecting their clients,
  // client sees entries affecting only their own client row
  let where: any = {};
  if (session.user.role === "admin") {
    where = {
      OR: [
        { actorUserId: session.user.id },
        { onBehalfOfAdminId: session.user.id },
      ],
    };
  } else if (session.user.role === "client") {
    where = {
      entityType: { in: ["Client", "Transaction", "Payment"] },
      entityId: session.user.linkedClientId || "__none__",
    };
  }

  const logs = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { actor: { select: { name: true, email: true } } },
  });

  const entries = logs.map((l) => ({
    id: l.id,
    createdAt: l.createdAt.toISOString(),
    actorName: l.actor.name || l.actor.email,
    actorRole: l.actorRole,
    action: l.action,
    entityType: l.entityType,
    entityId: l.entityId,
    summary: l.summary ?? null,
    onBehalfOfAdminId: l.onBehalfOfAdminId ?? null,
    beforeJson: l.beforeJson ?? null,
    afterJson: l.afterJson ?? null,
  }));

  return (
    <AppShell role={session.user.role} userName={session.user.name || session.user.email} currentPath="/audit">
      <div style={{ marginBottom: "2rem" }}>
        <div style={{ fontSize: "0.75rem", color: "#7c5cff", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "0.5rem" }}>
          Audit Trail
        </div>
        <h1 style={{ fontSize: "2rem", fontWeight: 700, letterSpacing: "-0.02em" }}>Audit Log</h1>
        <p style={{ color: "#9ca3af", marginTop: "0.5rem" }}>
          Every create, edit, and delete is recorded here. Click a row to see the full before/after diff. Showing last 200 entries.
        </p>
      </div>

      <AuditLogTable entries={entries} />
    </AppShell>
  );
}
