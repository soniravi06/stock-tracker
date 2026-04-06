import { requireSession, getAuthorizedClient } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/AppShell";
import { buildGainSummary } from "@/lib/fifo";
import { getPrices } from "@/lib/prices";
import { inr, fmtDate, fmtNum } from "@/lib/format";
import { notFound } from "next/navigation";
import Link from "next/link";

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  const { id } = await params;
  const client = await getAuthorizedClient(id);
  if (!client) notFound();

  const [transactions, payments] = await Promise.all([
    prisma.transaction.findMany({
      where: { clientId: id, deletedAt: null },
      orderBy: { tradeDate: "desc" },
    }),
    prisma.payment.findMany({
      where: { clientId: id, deletedAt: null },
      orderBy: { date: "desc" },
    }),
  ]);

  // Prices
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

  const canEdit = session.user.role !== "client";

  return (
    <AppShell role={session.user.role} userName={session.user.name || session.user.email} currentPath="/clients">
      <div style={{ marginBottom: "2rem" }}>
        <Link href="/clients" style={{ fontSize: "0.8rem", color: "#9ca3af" }}>← All clients</Link>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginTop: "0.75rem" }}>
          <div>
            <h1 style={{ fontSize: "2rem", fontWeight: 700, letterSpacing: "-0.02em" }}>{client.name}</h1>
            <div style={{ color: "#9ca3af", marginTop: "0.35rem", fontSize: "0.875rem" }}>
              {client.email && <>📧 {client.email} &nbsp;·&nbsp; </>}
              {client.phone && <>📞 {client.phone}</>}
            </div>
            <div style={{ fontSize: "0.75rem", color: "#9ca3af", marginTop: "0.35rem" }}>
              Commission: {client.defaultCommissionType === "percentage"
                ? `${client.defaultCommissionValue}%`
                : `₹${client.defaultCommissionValue} flat`}
            </div>
          </div>
          {canEdit && (
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <Link href={`/clients/${id}/transactions/new`} className="btn btn-primary">+ Transaction</Link>
              <Link href={`/clients/${id}/payments/new`} className="btn btn-ghost">+ Payment</Link>
            </div>
          )}
        </div>
      </div>

      {/* Stats */}
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
          <div className="stat-label">Realized STCG</div>
          <div className={`stat-value ${summary.totals.realizedSTCG >= 0 ? "pos" : "neg"}`} style={{ fontSize: "1.35rem" }}>
            {inr(summary.totals.realizedSTCG)}
          </div>
        </div>
        <div className="glass stat-card">
          <div className="stat-label">Realized LTCG</div>
          <div className={`stat-value ${summary.totals.realizedLTCG >= 0 ? "pos" : "neg"}`} style={{ fontSize: "1.35rem" }}>
            {inr(summary.totals.realizedLTCG)}
          </div>
        </div>
      </div>

      {/* Holdings */}
      <SectionHeader title="Current Holdings" />
      <div className="glass" style={{ overflow: "hidden", marginBottom: "2rem" }}>
        <table className="data">
          <thead>
            <tr>
              <th>Symbol</th>
              <th style={{ textAlign: "right" }}>Qty</th>
              <th style={{ textAlign: "right" }}>Avg Cost</th>
              <th style={{ textAlign: "right" }}>Current Price</th>
              <th style={{ textAlign: "right" }}>Market Value</th>
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

      {/* Transactions */}
      <SectionHeader title="Transactions" />
      <div className="glass" style={{ overflow: "hidden", marginBottom: "2rem" }}>
        <table className="data">
          <thead>
            <tr>
              <th>Date</th>
              <th>Symbol</th>
              <th>Type</th>
              <th style={{ textAlign: "right" }}>Qty</th>
              <th style={{ textAlign: "right" }}>Price</th>
              <th style={{ textAlign: "right" }}>Commission</th>
              <th style={{ textAlign: "right" }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {transactions.length === 0 && (
              <tr><td colSpan={7} style={{ textAlign: "center", color: "#9ca3af", padding: "2rem" }}>No transactions.</td></tr>
            )}
            {transactions.map((t) => {
              const gross = t.quantity * t.pricePerShare;
              const net = t.type === "buy" ? gross + t.commissionAmount : gross - t.commissionAmount;
              return (
                <tr key={t.id}>
                  <td>{fmtDate(t.tradeDate)}</td>
                  <td style={{ fontWeight: 600 }}>{t.symbol} <span style={{ color: "#6b7280", fontSize: "0.7rem" }}>{t.exchange}</span></td>
                  <td><span className={`badge badge-${t.type}`}>{t.type}</span></td>
                  <td style={{ textAlign: "right" }}>{fmtNum(t.quantity, 0)}</td>
                  <td style={{ textAlign: "right" }}>{inr(t.pricePerShare)}</td>
                  <td style={{ textAlign: "right", color: "#9ca3af" }}>{inr(t.commissionAmount)}</td>
                  <td style={{ textAlign: "right", fontWeight: 600 }}>{inr(net)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Realized gains breakdown */}
      {summary.realized.length > 0 && (
        <>
          <SectionHeader title="Realized Gains (FIFO)" />
          <div className="glass" style={{ overflow: "hidden", marginBottom: "2rem" }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Sell Date</th>
                  <th>Symbol</th>
                  <th style={{ textAlign: "right" }}>Qty</th>
                  <th style={{ textAlign: "right" }}>Proceeds (net)</th>
                  <th style={{ textAlign: "right" }}>Cost Basis</th>
                  <th style={{ textAlign: "right" }}>Gain</th>
                  <th>Days Held</th>
                  <th>Class</th>
                </tr>
              </thead>
              <tbody>
                {summary.realized.map((r, i) => (
                  <tr key={i}>
                    <td>{fmtDate(r.sellDate)}</td>
                    <td style={{ fontWeight: 600 }}>{r.symbol}</td>
                    <td style={{ textAlign: "right" }}>{fmtNum(r.quantity, 0)}</td>
                    <td style={{ textAlign: "right" }}>{inr(r.saleProceedsNet)}</td>
                    <td style={{ textAlign: "right" }}>{inr(r.costBasis)}</td>
                    <td style={{ textAlign: "right", fontWeight: 600 }} className={r.gain >= 0 ? "pos" : "neg"}>
                      {inr(r.gain)}
                    </td>
                    <td style={{ color: "#9ca3af" }}>{r.holdingDays}</td>
                    <td><span className={`badge badge-${r.classification.toLowerCase()}`}>{r.classification}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Payments */}
      <SectionHeader title="Payments" />
      <div className="glass" style={{ overflow: "hidden" }}>
        <table className="data">
          <thead>
            <tr>
              <th>Date</th>
              <th>Direction</th>
              <th style={{ textAlign: "right" }}>Amount</th>
              <th>Status</th>
              <th>Notes</th>
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

function SectionHeader({ title }: { title: string }) {
  return (
    <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.75rem", color: "#a78bfa", textTransform: "uppercase", letterSpacing: "0.08em" }}>
      {title}
    </h2>
  );
}
