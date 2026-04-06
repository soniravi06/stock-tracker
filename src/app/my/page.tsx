import { requireSession } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/AppShell";
import { buildGainSummary } from "@/lib/fifo";
import { getPrices } from "@/lib/prices";
import { inr, fmtDate, fmtNum } from "@/lib/format";
import { redirect } from "next/navigation";

export default async function MyPortfolioPage() {
  const session = await requireSession();
  if (session.user.role !== "client") redirect("/dashboard");
  const clientId = session.user.linkedClientId;
  if (!clientId) redirect("/login");

  const client = await prisma.client.findFirst({
    where: { id: clientId, deletedAt: null },
  });
  if (!client) redirect("/login");

  const [transactions, payments] = await Promise.all([
    prisma.transaction.findMany({
      where: { clientId, deletedAt: null },
      orderBy: { tradeDate: "desc" },
    }),
    prisma.payment.findMany({
      where: { clientId, deletedAt: null },
      orderBy: { date: "desc" },
    }),
  ]);

  const symbols = Array.from(
    new Set(transactions.map((t) => `${t.symbol}:${t.exchange}`))
  ).map((s) => {
    const [symbol, exchange] = s.split(":");
    return { symbol, exchange: exchange as "NSE" | "BSE" };
  });
  const priceMap = await getPrices(symbols);
  const summary = buildGainSummary(transactions, priceMap);

  let portfolioValue = 0;
  for (const h of summary.holdings) {
    const px = priceMap.get(h.symbol);
    if (px != null) portfolioValue += px * h.quantity;
  }

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
          <div className="stat-label">Unrealized</div>
          <div className={`stat-value ${summary.totals.unrealizedTotal >= 0 ? "pos" : "neg"}`}>
            {inr(summary.totals.unrealizedTotal)}
          </div>
        </div>
        <div className="glass stat-card">
          <div className="stat-label">STCG</div>
          <div className={`stat-value ${summary.totals.realizedSTCG >= 0 ? "pos" : "neg"}`} style={{ fontSize: "1.35rem" }}>
            {inr(summary.totals.realizedSTCG)}
          </div>
        </div>
        <div className="glass stat-card">
          <div className="stat-label">LTCG</div>
          <div className={`stat-value ${summary.totals.realizedLTCG >= 0 ? "pos" : "neg"}`} style={{ fontSize: "1.35rem" }}>
            {inr(summary.totals.realizedLTCG)}
          </div>
        </div>
      </div>

      <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.75rem", color: "#a78bfa", textTransform: "uppercase", letterSpacing: "0.08em" }}>Holdings</h2>
      <div className="glass" style={{ overflow: "hidden", marginBottom: "2rem" }}>
        <table className="data">
          <thead>
            <tr>
              <th>Symbol</th>
              <th style={{ textAlign: "right" }}>Qty</th>
              <th style={{ textAlign: "right" }}>Avg Cost</th>
              <th style={{ textAlign: "right" }}>Current</th>
              <th style={{ textAlign: "right" }}>Value</th>
              <th style={{ textAlign: "right" }}>Unrealized</th>
            </tr>
          </thead>
          <tbody>
            {summary.holdings.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: "center", color: "#9ca3af", padding: "2rem" }}>No open positions.</td></tr>
            )}
            {summary.holdings.map((h) => {
              const price = priceMap.get(h.symbol);
              const mv = price != null ? price * h.quantity : null;
              const unrl = price != null ? (price - h.avgCostPerShare) * h.quantity : null;
              return (
                <tr key={h.symbol}>
                  <td style={{ fontWeight: 600 }}>{h.symbol}</td>
                  <td style={{ textAlign: "right" }}>{fmtNum(h.quantity, 0)}</td>
                  <td style={{ textAlign: "right" }}>{inr(h.avgCostPerShare)}</td>
                  <td style={{ textAlign: "right" }}>{price != null ? inr(price) : "—"}</td>
                  <td style={{ textAlign: "right" }}>{mv != null ? inr(mv) : "—"}</td>
                  <td style={{ textAlign: "right" }} className={(unrl ?? 0) >= 0 ? "pos" : "neg"}>
                    {unrl != null ? inr(unrl) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.75rem", color: "#a78bfa", textTransform: "uppercase", letterSpacing: "0.08em" }}>Transactions</h2>
      <div className="glass" style={{ overflow: "hidden", marginBottom: "2rem" }}>
        <table className="data">
          <thead>
            <tr>
              <th>Date</th><th>Symbol</th><th>Type</th>
              <th style={{ textAlign: "right" }}>Qty</th>
              <th style={{ textAlign: "right" }}>Price</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((t) => (
              <tr key={t.id}>
                <td>{fmtDate(t.tradeDate)}</td>
                <td style={{ fontWeight: 600 }}>{t.symbol}</td>
                <td><span className={`badge badge-${t.type}`}>{t.type}</span></td>
                <td style={{ textAlign: "right" }}>{fmtNum(t.quantity, 0)}</td>
                <td style={{ textAlign: "right" }}>{inr(t.pricePerShare)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.75rem", color: "#a78bfa", textTransform: "uppercase", letterSpacing: "0.08em" }}>Payments</h2>
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
