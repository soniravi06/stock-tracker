export const dynamic = "force-dynamic";

import { requireSession, scopedClientWhere } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/AppShell";
import Link from "next/link";
import { fmtDate } from "@/lib/format";

export default async function ClientsListPage() {
  const session = await requireSession();
  const where = await scopedClientWhere();
  const clients = await prisma.client.findMany({
    where,
    include: {
      _count: { select: { transactions: true, completedTrades: true, payments: true } },
      admin: { select: { name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const isSuper = session.user.role === "superadmin";

  return (
    <AppShell role={session.user.role} userName={session.user.name || session.user.email} currentPath="/clients">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" }}>
        <div>
          <div style={{ fontSize: "0.75rem", color: "#7c5cff", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "0.5rem" }}>
            {isSuper ? "All Clients" : "Your Clients"}
          </div>
          <h1 style={{ fontSize: "2rem", fontWeight: 700, letterSpacing: "-0.02em" }}>Clients</h1>
        </div>
        {session.user.role !== "client" && (
          <Link href="/clients/new" className="btn btn-primary">+ New Client</Link>
        )}
      </div>

      <div className="glass" style={{ overflow: "hidden" }}>
        <table className="data">
          <thead>
            <tr>
              <th>Name</th>
              <th>Contact</th>
              {isSuper && <th>Managed by</th>}
              <th>Default Commission</th>
              <th>Buy Lots</th>
              <th>Closed Trades</th>
              <th>Created</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {clients.length === 0 && (
              <tr><td colSpan={isSuper ? 8 : 7} style={{ textAlign: "center", color: "#9ca3af", padding: "2rem" }}>No clients yet.</td></tr>
            )}
            {clients.map((c) => (
              <tr key={c.id}>
                <td style={{ fontWeight: 600 }}>{c.name}</td>
                <td style={{ color: "#9ca3af", fontSize: "0.8rem" }}>
                  {c.email}<br/>{c.phone}
                </td>
                {isSuper && <td style={{ color: "#9ca3af" }}>{c.admin.name || c.admin.email}</td>}
                <td style={{ fontSize: "0.8rem" }}>
                  {c.defaultCommissionType === "percentage"
                    ? `${c.defaultCommissionValue}%`
                    : `₹${c.defaultCommissionValue} flat`}
                </td>
                <td>{c._count.transactions}</td>
                <td>{c._count.completedTrades}</td>
                <td style={{ color: "#9ca3af", fontSize: "0.8rem" }}>{fmtDate(c.createdAt)}</td>
                <td style={{ textAlign: "right" }}>
                  <Link href={`/clients/${c.id}`} className="btn btn-ghost" style={{ fontSize: "0.75rem", padding: "0.35rem 0.75rem" }}>
                    Open →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
