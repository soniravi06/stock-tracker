export const dynamic = "force-dynamic";

import { requireSession, scopedClientWhere } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/AppShell";
import { inr, fmtDate, fmtNum } from "@/lib/format";
import Link from "next/link";
import { redirect } from "next/navigation";

type SearchParams = {
  client?: string;
  symbol?: string;
  type?: string; // "buy" | "sell" | "all"
  from?: string;
  to?: string;
};

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await requireSession();
  if (session.user.role === "client") redirect("/my");

  const sp = await searchParams;
  const where = await scopedClientWhere();

  // Load scoped clients for the filter dropdown + name lookup
  const clients = await prisma.client.findMany({
    where,
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const clientName = new Map(clients.map((c) => [c.id, c.name]));
  const scopedClientIds = clients.map((c) => c.id);

  // Build filters
  const clientFilter = sp.client && sp.client !== "all" ? sp.client : undefined;
  const symbolFilter = sp.symbol?.trim().toUpperCase() || undefined;
  const typeFilter = sp.type === "buy" || sp.type === "sell" ? sp.type : "all";
  const fromDate = sp.from ? new Date(sp.from) : undefined;
  const toDate = sp.to ? new Date(sp.to) : undefined;
  if (toDate) toDate.setHours(23, 59, 59, 999);

  const baseClientWhere = clientFilter
    ? { clientId: clientFilter }
    : { clientId: { in: scopedClientIds } };

  // Fetch buys (Transaction) and sells (CompletedTrade) in parallel
  const [buys, sells] = await Promise.all([
    typeFilter === "sell"
      ? Promise.resolve([])
      : prisma.transaction.findMany({
          where: {
            ...baseClientWhere,
            deletedAt: null,
            ...(symbolFilter ? { symbol: symbolFilter } : {}),
            ...(fromDate || toDate
              ? { tradeDate: { ...(fromDate ? { gte: fromDate } : {}), ...(toDate ? { lte: toDate } : {}) } }
              : {}),
          },
          orderBy: { tradeDate: "desc" },
          take: 500,
        }),
    typeFilter === "buy"
      ? Promise.resolve([])
      : prisma.completedTrade.findMany({
          where: {
            ...baseClientWhere,
            deletedAt: null,
            ...(symbolFilter ? { symbol: symbolFilter } : {}),
            ...(fromDate || toDate
              ? { sellDate: { ...(fromDate ? { gte: fromDate } : {}), ...(toDate ? { lte: toDate } : {}) } }
              : {}),
          },
          orderBy: { sellDate: "desc" },
          take: 500,
        }),
  ]);

  // Normalize into a unified row list
  type Row = {
    kind: "buy" | "sell";
    date: Date;
    clientId: string;
    symbol: string;
    exchange: string;
    qty: number;
    price: number;
    value: number;
    pnl?: number;
    id: string;
  };

  const rows: Row[] = [
    ...buys.map((t) => ({
      kind: "buy" as const,
      date: t.tradeDate,
      clientId: t.clientId,
      symbol: t.symbol,
      exchange: t.exchange,
      qty: t.quantity,
      price: t.pricePerShare,
      value: t.quantity * t.pricePerShare,
      id: t.id,
    })),
    ...sells.map((t) => ({
      kind: "sell" as const,
      date: t.sellDate,
      clientId: t.clientId,
      symbol: t.symbol,
      exchange: t.exchange,
      qty: t.sellQty,
      price: t.sellPricePerShare,
      value: t.totalSellProceeds,
      pnl: t.netPnL,
      id: t.id,
    })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

  const isSuper = session.user.role === "superadmin";

  return (
    <AppShell role={session.user.role} userName={session.user.name || session.user.email} currentPath="/transactions">
      <div style={{ marginBottom: "2rem" }}>
        <div style={{ fontSize: "0.75rem", color: "#7c5cff", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "0.5rem" }}>
          {isSuper ? "All Transactions" : "Your Clients' Transactions"}
        </div>
        <h1 style={{ fontSize: "2rem", fontWeight: 700, letterSpacing: "-0.02em" }}>Transactions</h1>
        <p style={{ color: "#9ca3af", marginTop: "0.5rem" }}>
          Every buy lot and completed sell across {isSuper ? "all clients" : "your clients"}.
        </p>
      </div>

      {/* Filters */}
      <form method="get" className="glass" style={{ padding: "1rem 1.25rem", marginBottom: "1.25rem", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "0.75rem", alignItems: "end" }}>
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
          <label className="label">Symbol</label>
          <input className="input" name="symbol" placeholder="RELIANCE" defaultValue={sp.symbol || ""} />
        </div>
        <div>
          <label className="label">Type</label>
          <select className="select" name="type" defaultValue={typeFilter}>
            <option value="all">Buy + Sell</option>
            <option value="buy">Buy only</option>
            <option value="sell">Sell only</option>
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
          <Link href="/transactions" className="btn btn-ghost">Reset</Link>
        </div>
      </form>

      <div className="glass" style={{ overflow: "hidden" }}>
        <table className="data">
          <thead>
            <tr>
              <th>Date</th>
              <th>Client</th>
              <th>Type</th>
              <th>Symbol</th>
              <th style={{ textAlign: "right" }}>Qty</th>
              <th style={{ textAlign: "right" }}>Price</th>
              <th style={{ textAlign: "right" }}>Value</th>
              <th style={{ textAlign: "right" }}>Net P&L</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={9} style={{ textAlign: "center", color: "#9ca3af", padding: "2rem" }}>No transactions match these filters.</td></tr>
            )}
            {rows.map((r) => (
              <tr key={`${r.kind}-${r.id}`}>
                <td style={{ color: "#9ca3af", fontSize: "0.8rem" }}>{fmtDate(r.date)}</td>
                <td style={{ fontWeight: 600 }}>{clientName.get(r.clientId) || "—"}</td>
                <td><span className={`badge badge-${r.kind}`}>{r.kind.toUpperCase()}</span></td>
                <td>
                  {r.symbol}
                  <span style={{ color: "#6b7280", fontSize: "0.7rem", marginLeft: 6 }}>{r.exchange}</span>
                </td>
                <td style={{ textAlign: "right" }}>{fmtNum(r.qty)}</td>
                <td style={{ textAlign: "right" }}>{inr(r.price)}</td>
                <td style={{ textAlign: "right" }}>{inr(r.value)}</td>
                <td style={{ textAlign: "right" }} className={r.pnl == null ? "" : r.pnl >= 0 ? "pos" : "neg"}>
                  {r.pnl == null ? "—" : inr(r.pnl)}
                </td>
                <td style={{ textAlign: "right" }}>
                  <Link href={`/clients/${r.clientId}`} className="btn btn-ghost" style={{ fontSize: "0.7rem", padding: "0.3rem 0.7rem" }}>Client →</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
