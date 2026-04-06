import { requireSession } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/AppShell";
import { fmtDate } from "@/lib/format";

export default async function AuditPage() {
  const session = await requireSession();

  // Scope: superadmin sees all, admin sees own + entries affecting their clients,
  // client sees entries affecting only their own client row
  let where: any = {};
  if (session.user.role === "admin") {
    // All logs where the actor is this admin, or onBehalfOfAdminId == this admin
    where = {
      OR: [
        { actorUserId: session.user.id },
        { onBehalfOfAdminId: session.user.id },
      ],
    };
  } else if (session.user.role === "client") {
    // Only entries targeting their linked client id
    where = {
      entityType: { in: ["Client", "Transaction", "Payment"] },
      // Filtering by entityId equal to linkedClientId for Client entries,
      // and by related-client is handled by just showing anything tied to their clientId
      entityId: session.user.linkedClientId || "__none__",
    };
  }

  const logs = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { actor: { select: { name: true, email: true } } },
  });

  return (
    <AppShell role={session.user.role} userName={session.user.name || session.user.email} currentPath="/audit">
      <div style={{ marginBottom: "2rem" }}>
        <div style={{ fontSize: "0.75rem", color: "#7c5cff", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "0.5rem" }}>
          Audit Trail
        </div>
        <h1 style={{ fontSize: "2rem", fontWeight: 700, letterSpacing: "-0.02em" }}>Audit Log</h1>
        <p style={{ color: "#9ca3af", marginTop: "0.5rem" }}>
          Every create, edit, and delete is recorded here. Showing last 200 entries.
        </p>
      </div>

      <div className="glass" style={{ overflow: "hidden" }}>
        <table className="data">
          <thead>
            <tr>
              <th>When</th>
              <th>Actor</th>
              <th>Role</th>
              <th>Action</th>
              <th>Entity</th>
              <th>Entity ID</th>
              <th>On behalf of</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 && (
              <tr><td colSpan={7} style={{ textAlign: "center", color: "#9ca3af", padding: "2rem" }}>No activity yet.</td></tr>
            )}
            {logs.map((l) => (
              <tr key={l.id}>
                <td style={{ fontSize: "0.8rem" }}>{fmtDate(l.createdAt)}<br/>
                  <span style={{ color: "#6b7280", fontSize: "0.7rem" }}>
                    {new Date(l.createdAt).toLocaleTimeString("en-IN")}
                  </span>
                </td>
                <td>{l.actor.name || l.actor.email}</td>
                <td><span className="badge" style={{ background: "rgba(124, 92, 255, 0.15)", color: "#c4b5fd" }}>{l.actorRole}</span></td>
                <td>{l.action}</td>
                <td>{l.entityType}</td>
                <td style={{ fontFamily: "monospace", fontSize: "0.7rem", color: "#9ca3af" }}>{l.entityId.slice(0, 12)}…</td>
                <td style={{ color: "#9ca3af", fontSize: "0.8rem" }}>{l.onBehalfOfAdminId ? "admin" : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
