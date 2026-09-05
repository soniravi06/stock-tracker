export const dynamic = "force-dynamic";

import { requireSession, scopedClientWhere } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/AppShell";
import { inr } from "@/lib/format";
import Link from "next/link";
import { redirect } from "next/navigation";

type SearchParams = {
  client?: string;
  from?: string;
  to?: string;
};

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-IN", {
    month: "short",
    year: "numeric",
  });
}

export default async function CommissionReportPage({
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
  const clientName = new Map(clients.map((c) => [c.id, c.name]));
  const scopedClientIds = clients.map((c) => c.id);

  const clientFilter = sp.client && sp.client !== "all" ? sp.client : undefined;
  const fromDate = sp.from ? new Date(sp.from) : undefined;
  const toDate = sp.to ? new Date(sp.to) : undefined;
  if (toDate) toDate.setHours(23, 59, 59, 999);

  const trades = await prisma.completedTrade.findMany({
    where: {
      deletedAt: null,
      clientId: clientFilter ? clientFilter : { in: scopedClientIds },
      ...(fromDate || toDate
        ? { sellDate: { ...(fromDate ? { gte: fromDate } : {}), ...(toDate ? { lte: toDate } : {}) } }
        : {}),
    },
    orderBy: { sellDate: "desc" },
  });

  // Per-client totals
  const perClient = new Map<string, { name: string; commission: number; trades: number; grossPnL: number }>();
  // Per-month totals
  const perMonth = new Map<string, { commission: number; trades: number }>();

  let totalCommission = 0;
  for (const t of trades) {
    totalCommission += t.commissionAmount;

    const c = perClient.get(t.clientId) || {
      name: clientName.get(t.clientId) || "—",
      commission: 0,
      trades: 0,
      grossPnL: 0,
    };
    c.commission += t.commissionAmount;
    c.trades += 1;
    c.grossPnL += t.grossPnL;
    perClient.set(t.clientId, c);

    const mk = monthKey(t.sellDate);
    const m = perMonth.get(mk) || { commission: 0, trades: 0 };
    m.commission += t.commissionAmount;
    m.trades += 1;
    perMonth.set(mk, m);
  }

  const clientRows = Array.from(perClient.values()).sort((a, b) => b.commission - a.commission);
  const monthRows = Array.from(perMonth.entries())
    .map(([key, v]) => ({ key, ...v }))
    .sort((a, b) => b.key.localeCompare(a.key));

  const isSuper = session.user.role === "superadmin";

  return (
    <AppShell role={session.user.role} userName={session.user.name || session.user.email} currentPath="/reports/commission">
      <div style={{ marginBottom: "2rem" }}>
        <div style={{ fontSize: "0.75rem", color: "#7c5cff", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "0.5rem" }}>
          Reports
        </div>
        <h1 style={{ fontSize: "2rem", fontWeight: 700, letterSpacing: "-0.02em" }}>Commission Earnings</h1>
        <p style={{ color: "#9ca3af", marginTop: "0.5rem" }}>
          Commission earned on completed trades across {isSuper ? "all clients" : "your clients"}.
        </p>
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
          <label className="label">From</label>
          <input className="input" type="date" name="from" defaultValue={sp.from || ""} />
        </div>
        <div>
          <label className="label">To</label>
          <input className="input" type="date" name="to" defaultValue={sp.to || ""} />
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button type="submit" className="btn btn-primary" style={{ flex: 1, justifyContent: "center" }}>Filter</button>
          <Link href="/reports/commission" className="btn btn-ghost">Reset</Link>
        </div>
      </form>

      {/* Total */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
        <div className="glass stat-card">
          <div className="stat-label">Total Commission</div>
          <div className="stat-value commission">{inr(totalCommission)}</div>
        </div>
        <div className="glass stat-card">
          <div className="stat-label">Completed Trades</div>
          <div className="stat-value">{trades.length}</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "1.5rem" }}>
        {/* Per client */}
        <div>
          <h2 style={{ fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.75rem", color: "#a78bfa", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            By Client
          </h2>
          <div className="glass" style={{ overflow: "hidden" }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Client</th>
                  <th style={{ textAlign: "right" }}>Trades</th>
                  <th style={{ textAlign: "right" }}>Gross P&L</th>
                  <th style={{ textAlign: "right" }}>Commission</th>
                </tr>
              </thead>
              <tbody>
                {clientRows.length === 0 && (
                  <tr><td colSpan={4} style={{ textAlign: "center", color: "#9ca3af", padding: "2rem" }}>No completed trades in this period.</td></tr>
                )}
                {clientRows.map((c) => (
                  <tr key={c.name}>
                    <td style={{ fontWeight: 600 }}>{c.name}</td>
                    <td style={{ textAlign: "right" }}>{c.trades}</td>
                    <td style={{ textAlign: "right" }} className={c.grossPnL >= 0 ? "pos" : "neg"}>{inr(c.grossPnL)}</td>
                    <td style={{ textAlign: "right" }} className="commission">{inr(c.commission)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Per month */}
        <div>
          <h2 style={{ fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.75rem", color: "#a78bfa", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            By Month
          </h2>
          <div className="glass" style={{ overflow: "hidden" }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Month</th>
                  <th style={{ textAlign: "right" }}>Trades</th>
                  <th style={{ textAlign: "right" }}>Commission</th>
                </tr>
              </thead>
              <tbody>
                {monthRows.length === 0 && (
                  <tr><td colSpan={3} style={{ textAlign: "center", color: "#9ca3af", padding: "2rem" }}>No completed trades in this period.</td></tr>
                )}
                {monthRows.map((m) => (
                  <tr key={m.key}>
                    <td style={{ fontWeight: 600 }}>{monthLabel(m.key)}</td>
                    <td style={{ textAlign: "right" }}>{m.trades}</td>
                    <td style={{ textAlign: "right" }} className="commission">{inr(m.commission)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
