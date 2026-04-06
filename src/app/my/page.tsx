import { requireSession } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/AppShell";
import { buildHoldings } from "@/lib/fifo";
import { getPrices } from "@/lib/prices";
import { inr, fmtDate, fmtNum } from "@/lib/format";
import { redirect } from "next/navigation";
import { HoldingsTable } from "@/components/HoldingsTable";
import { CompletedTradesTable } from "@/components/CompletedTradesTable";

export default async function MyPortfolioPage() {
  const session = await requireSession();
  if (session.user.role !== "client") redirect("/dashboard");
  const clientId = session.user.linkedClientId;
  if (!clientId) redirect("/login");

  const client = await prisma.client.findFirst({
    where: { id: clientId, deletedAt: null },
  });
  if (!client) redirect("/login");

  const [lots, completedTrades, payments] = await Promise.all([
    prisma.transaction.findMany({
      where: { clientId, deletedAt: null },
      orderBy: { tradeDate: "asc" },
    }),
    prisma.completedTrade.findMany({
      where: { clientId, deletedAt: null },
      orderBy: { sellDate: "desc" },
    }),
    prisma.payment.findMany({
      where: { clientId, deletedAt: null },
      orderBy: { date: "desc" },
    }),
  ]);

  const holdings = buildHoldings(lots);

  const symbols = Array.from(
    new Set(holdings.map((h) => `${h.symbol}:${h.exchange}`))
  ).map((s) => {
    const [symbol, exchange] = s.split(":");
    return { symbol, exchange: exchange as "NSE" | "BSE" };
  });
  const priceMap = await getPrices(symbols);

  let portfolioValue = 0;
  let totalUnrealized = 0;
  for (const h of holdings) {
    const px = priceMap.get(h.symbol);
    if (px != null) {
      portfolioValue += px * h.totalQty;
      totalUnrealized += (px - h.avgCostPerShare) * h.totalQty;
    }
  }

  const totalRealized = completedTrades.reduce((s, t) => s + t.netPnL, 0);
  const totalCommission = completedTrades.reduce((s, t) => s + t.commissionAmount, 0);

  const pricesPlain: Record<string, number> = {};
  for (const [k, v] of priceMap.entries()) pricesPlain[k] = v;

  return (
    <AppShell role="client" userName={client.name} currentPath="/my">
      <div style={{ marginBottom: "2rem" }}>
        <div style={{ fontSize: "0.75rem", color: "#7c5cff", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "0.5rem" }}>
          Your Portfolio (read-only)
        </div>
        <h1 style={{ fontSize: "2rem", fontWeight: 700, letterSpacing: "-0.02em" }}>{client.name}</h1>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem", marginBottom: "2rem" }}>
        <div className="glass stat-card">
          <div className="stat-label">Portfolio Value</div>
          <div className="stat-value">{inr(portfolioValue)}</div>
        </div>
        <div className="glass stat-card">
          <div className="stat-label">Unrealized P&L</div>
          <div className={`stat-value ${totalUnrealized >= 0 ? "pos" : "neg"}`}>{inr(totalUnrealized)}</div>
        </div>
        <div className="glass stat-card">
          <div className="stat-label">Realized P&L (net)</div>
          <div className={`stat-value ${totalRealized >= 0 ? "pos" : "neg"}`}>{inr(totalRealized)}</div>
        </div>
        <div className="glass stat-card">
          <div className="stat-label">Commission Paid</div>
          <div className="stat-value" style={{ fontSize: "1.4rem" }}>{inr(totalCommission)}</div>
        </div>
      </div>

      <h2 style={{ fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.75rem", color: "#a78bfa", textTransform: "uppercase", letterSpacing: "0.08em" }}>Current Holdings</h2>
      <HoldingsTable
        holdings={holdings.map((h) => ({
          symbol: h.symbol,
          exchange: h.exchange,
          totalQty: h.totalQty,
          avgCostPerShare: h.avgCostPerShare,
          totalCostBasis: h.totalCostBasis,
          lots: h.lots.map((l) => ({
            transactionId: l.transactionId,
            buyDate: l.buyDate.toISOString(),
            originalQty: l.originalQty,
            remainingQty: l.remainingQty,
            pricePerShare: l.pricePerShare,
          })),
        }))}
        prices={pricesPlain}
        clientId={clientId}
        defaultCommissionType={client.defaultCommissionType}
        defaultCommissionValue={client.defaultCommissionValue}
        canEdit={false}
      />

      <div style={{ height: 32 }} />

      <h2 style={{ fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.75rem", color: "#a78bfa", textTransform: "uppercase", letterSpacing: "0.08em" }}>Completed Trades</h2>
      <CompletedTradesTable
        trades={completedTrades.map((t) => ({
          id: t.id,
          symbol: t.symbol,
          sellDate: t.sellDate.toISOString(),
          sellQty: t.sellQty,
          sellPricePerShare: t.sellPricePerShare,
          avgBuyPrice: t.avgBuyPrice,
          grossPnL: t.grossPnL,
          commissionType: t.commissionType,
          commissionValue: t.commissionValue,
          commissionAmount: t.commissionAmount,
          netPnL: t.netPnL,
          matchedLotsJson: t.matchedLotsJson,
          notes: t.notes,
        }))}
        canEdit={false}
      />

      <div style={{ height: 32 }} />

      <h2 style={{ fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.75rem", color: "#a78bfa", textTransform: "uppercase", letterSpacing: "0.08em" }}>Payments</h2>
      <div className="glass" style={{ overflow: "hidden" }}>
        <table className="data">
          <thead>
            <tr>
              <th>Date</th><th>Direction</th>
              <th style={{ textAlign: "right" }}>Amount</th>
              <th>Status</th><th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {payments.length === 0 && (
              <tr><td colSpan={5} style={{ textAlign: "center", color: "#9ca3af", padding: "2rem" }}>No payments.</td></tr>
            )}
            {payments.map((p) => (
              <tr key={p.id}>
                <td>{fmtDate(p.date)}</td>
                <td>{p.direction === "in" ? "Deposit" : "Withdrawal"}</td>
                <td style={{ textAlign: "right", fontWeight: 600 }}>{inr(p.amount)}</td>
                <td><span className={`badge badge-${p.status}`}>{p.status}</span></td>
                <td style={{ color: "#9ca3af", fontSize: "0.8rem" }}>{p.notes || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
