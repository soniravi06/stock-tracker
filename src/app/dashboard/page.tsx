export const dynamic = "force-dynamic";

import { requireSession, scopedClientWhere } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/AppShell";
import { buildHoldings } from "@/lib/fifo";
import { getPrices } from "@/lib/prices";
import { inr } from "@/lib/format";
import Link from "next/link";
import { DashboardCharts } from "@/components/DashboardCharts";
import { RefreshPricesButton } from "@/components/RefreshPricesButton";

export default async function DashboardPage() {
  const session = await requireSession();
  const where = await scopedClientWhere();

  const clients = await prisma.client.findMany({
    where,
    select: {
      id: true,
      name: true,
      transactions: {
        where: { deletedAt: null },
        select: {
          id: true,
          symbol: true,
          exchange: true,
          quantity: true,
          remainingQty: true,
          pricePerShare: true,
          tradeDate: true,
          deletedAt: true,
        },
      },
      completedTrades: {
        where: { deletedAt: null },
        select: { netPnL: true, commissionAmount: true },
      },
      payments: {
        where: { deletedAt: null },
        select: { amount: true, status: true },
      },
    },
  });

  // Pull unique symbols and fetch prices in parallel
  const symbolSet = new Set<string>();
  for (const c of clients) {
    for (const t of c.transactions) {
      if (t.remainingQty > 0) symbolSet.add(`${t.symbol}:${t.exchange}`);
    }
  }
  const priceItems = Array.from(symbolSet).map((s) => {
    const [symbol, exchange] = s.split(":");
    return { symbol, exchange: exchange as "NSE" | "BSE" };
  });
  const priceMap = await getPrices(priceItems);

  let totalRealized = 0;
  let totalUnrealized = 0;
  let totalCommission = 0;
  let totalPortfolioValue = 0;
  let pendingPayments = 0;

  // Aggregate holdings across all clients for the top-holdings chart
  const holdingsBySymbol = new Map<string, number>();

  const perClient = clients.map((c) => {
    const holdings = buildHoldings(c.transactions);

    let portfolioValue = 0;
    let unrealized = 0;
    for (const h of holdings) {
      const px = priceMap.get(h.symbol);
      if (px != null) {
        const mv = px * h.totalQty;
        portfolioValue += mv;
        unrealized += (px - h.avgCostPerShare) * h.totalQty;
        holdingsBySymbol.set(h.symbol, (holdingsBySymbol.get(h.symbol) || 0) + mv);
      }
    }
    totalPortfolioValue += portfolioValue;
    totalUnrealized += unrealized;

    let realized = 0;
    let commission = 0;
    for (const t of c.completedTrades) {
      realized += t.netPnL;
      commission += t.commissionAmount;
    }
    totalRealized += realized;
    totalCommission += commission;

    for (const p of c.payments) {
      if (p.status === "pending") pendingPayments += p.amount;
    }

    return {
      id: c.id,
      name: c.name,
      holdingsCount: holdings.length,
      portfolioValue,
      realized,
      unrealized,
    };
  });

  // Chart datasets
  const clientValues = perClient
    .map((c) => ({ name: c.name, value: Math.round(c.portfolioValue) }))
    .filter((c) => c.value > 0)
    .sort((a, b) => b.value - a.value);

  const pnlSplit = [
    { name: "Realized", value: Math.round(totalRealized) },
    { name: "Unrealized", value: Math.round(totalUnrealized) },
  ];

  const topHoldings = Array.from(holdingsBySymbol.entries())
    .map(([symbol, value]) => ({ symbol, value: Math.round(value) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  return (
    <AppShell role={session.user.role} userName={session.user.name || session.user.email} currentPath="/dashboard">
      <div style={{ marginBottom: "2rem" }}>
        <div style={{ fontSize: "0.75rem", color: "#7c5cff", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "0.5rem" }}>
          {session.user.role === "superadmin" ? "Platform Overview" : "Your Dashboard"}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
          <h1 style={{ fontSize: "2rem", fontWeight: 700, letterSpacing: "-0.02em" }}>
            Welcome Back, {session.user.name?.split(" ")[0] || "there"}
          </h1>
          <RefreshPricesButton />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem", marginBottom: "2rem" }}>
        <div className="glass stat-card">
          <div className="stat-label">Portfolio Value</div>
          <div className="stat-value">{inr(totalPortfolioValue)}</div>
        </div>
        <div className="glass stat-card">
          <div className="stat-label">Unrealized P&L</div>
          <div className={`stat-value ${totalUnrealized >= 0 ? "pos" : "neg"}`}>
            {inr(totalUnrealized)}
          </div>
        </div>
        <div className="glass stat-card">
          <div className="stat-label">Realized P&L (net)</div>
          <div className={`stat-value ${totalRealized >= 0 ? "pos" : "neg"}`}>
            {inr(totalRealized)}
          </div>
        </div>
        <div className="glass stat-card">
          <div className="stat-label">Commission Paid</div>
          <div className="stat-value commission" style={{ fontSize: "1.4rem" }}>{inr(totalCommission)}</div>
        </div>
        <div className="glass stat-card">
          <div className="stat-label">Pending Payments</div>
          <div className="stat-value" style={{ fontSize: "1.4rem" }}>{inr(pendingPayments)}</div>
        </div>
      </div>

      <DashboardCharts clientValues={clientValues} pnlSplit={pnlSplit} topHoldings={topHoldings} />

      <div className="glass" style={{ padding: "1.25rem 1.5rem", marginBottom: "1rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ fontSize: "1.1rem", fontWeight: 600 }}>Clients</h2>
        {session.user.role !== "client" && (
          <Link href="/clients/new" className="btn btn-primary">+ New Client</Link>
        )}
      </div>

      <div className="glass" style={{ overflow: "hidden" }}>
        <table className="data">
          <thead>
            <tr>
              <th>Name</th>
              <th>Holdings</th>
              <th style={{ textAlign: "right" }}>Value</th>
              <th style={{ textAlign: "right" }}>Realized</th>
              <th style={{ textAlign: "right" }}>Unrealized</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {perClient.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: "center", color: "#9ca3af", padding: "2rem" }}>No clients yet.</td></tr>
            )}
            {perClient.map((c) => (
              <tr key={c.id}>
                <td style={{ fontWeight: 600 }}>{c.name}</td>
                <td>{c.holdingsCount}</td>
                <td style={{ textAlign: "right" }}>{inr(c.portfolioValue)}</td>
                <td style={{ textAlign: "right" }} className={c.realized >= 0 ? "pos" : "neg"}>{inr(c.realized)}</td>
                <td style={{ textAlign: "right" }} className={c.unrealized >= 0 ? "pos" : "neg"}>{inr(c.unrealized)}</td>
                <td style={{ textAlign: "right" }}>
                  <Link href={`/clients/${c.id}`} className="btn btn-ghost" style={{ fontSize: "0.75rem", padding: "0.35rem 0.75rem" }}>Open →</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
