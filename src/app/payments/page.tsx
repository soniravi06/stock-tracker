export const dynamic = "force-dynamic";

import { requireSession, scopedClientWhere } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/AppShell";
import { inr } from "@/lib/format";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PaymentsTable, type PaymentRow } from "@/components/PaymentsTable";

type SearchParams = {
  client?: string;
  status?: string; // "pending" | "received" | "all"
  direction?: string; // "in" | "out" | "all"
};

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await requireSession();
  if (session.user.role === "client") redirect("/my");

  const sp = await searchParams;
  const where = await scopedClientWhere();

  const clients = await prisma.client.findMany({
    where,
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const scopedClientIds = clients.map((c) => c.id);

  const clientFilter = sp.client && sp.client !== "all" ? sp.client : undefined;
  const statusFilter = sp.status === "pending" || sp.status === "received" ? sp.status : undefined;
  const directionFilter = sp.direction === "in" || sp.direction === "out" ? sp.direction : undefined;

  const payments = await prisma.payment.findMany({
    where: {
      deletedAt: null,
      clientId: clientFilter ? clientFilter : { in: scopedClientIds },
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(directionFilter ? { direction: directionFilter } : {}),
    },
    orderBy: { date: "desc" },
    take: 500,
  });

  const rows: PaymentRow[] = payments.map((p) => ({
    id: p.id,
    clientId: p.clientId,
    clientName: clients.find((c) => c.id === p.clientId)?.name || "—",
    amount: p.amount,
    direction: p.direction,
    status: p.status,
    date: p.date.toISOString(),
    notes: p.notes,
  }));

  const pendingTotal = rows
    .filter((r) => r.status === "pending")
    .reduce((s, r) => s + (r.direction === "in" ? r.amount : -r.amount), 0);
  const receivedTotal = rows
    .filter((r) => r.status === "received")
    .reduce((s, r) => s + (r.direction === "in" ? r.amount : -r.amount), 0);

  const isSuper = session.user.role === "superadmin";
  // Clients are redirected above, so anyone reaching here can edit.
  const canEdit = true;

  return (
    <AppShell role={session.user.role} userName={session.user.name || session.user.email} currentPath="/payments">
      <div style={{ marginBottom: "2rem" }}>
        <div style={{ fontSize: "0.75rem", color: "#7c5cff", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "0.5rem" }}>
          {isSuper ? "All Payments" : "Your Clients' Payments"}
        </div>
        <h1 style={{ fontSize: "2rem", fontWeight: 700, letterSpacing: "-0.02em" }}>Payments</h1>
        <p style={{ color: "#9ca3af", marginTop: "0.5rem" }}>
          Deposits and withdrawals across {isSuper ? "all clients" : "your clients"}. Mark pending payments as received.
        </p>
      </div>

      {/* Summary */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem", marginBottom: "1.25rem" }}>
        <div className="glass stat-card">
          <div className="stat-label">Pending (net)</div>
          <div className={`stat-value ${pendingTotal >= 0 ? "pos" : "neg"}`} style={{ fontSize: "1.4rem" }}>{inr(pendingTotal)}</div>
        </div>
        <div className="glass stat-card">
          <div className="stat-label">Received (net)</div>
          <div className={`stat-value ${receivedTotal >= 0 ? "pos" : "neg"}`} style={{ fontSize: "1.4rem" }}>{inr(receivedTotal)}</div>
        </div>
      </div>

      {/* Filters */}
      <form method="get" className="glass" style={{ padding: "1rem 1.25rem", marginBottom: "1.25rem", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "0.75rem", alignItems: "end" }}>
        <div>
          <label className="label">Client</label>
          <select className="select" name="client" defaultValue={sp.client || "all"}>
            <option value="all">All clients</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Status</label>
          <select className="select" name="status" defaultValue={sp.status || "all"}>
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="received">Received</option>
          </select>
        </div>
        <div>
          <label className="label">Direction</label>
          <select className="select" name="direction" defaultValue={sp.direction || "all"}>
            <option value="all">Deposits + Withdrawals</option>
            <option value="in">Deposits (in)</option>
            <option value="out">Withdrawals (out)</option>
          </select>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button type="submit" className="btn btn-primary" style={{ flex: 1, justifyContent: "center" }}>Filter</button>
          <Link href="/payments" className="btn btn-ghost">Reset</Link>
        </div>
      </form>

      <PaymentsTable rows={rows} canEdit={canEdit} />
    </AppShell>
  );
}
