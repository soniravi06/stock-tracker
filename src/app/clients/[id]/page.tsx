import { requireSession, getAuthorizedClient } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/AppShell";
import { buildHoldings } from "@/lib/fifo";
import { getPrices } from "@/lib/prices";
import { inr, fmtDate, fmtNum, fmtDateTime } from "@/lib/format";
import { notFound } from "next/navigation";
import Link from "next/link";
import { HoldingsTable } from "@/components/HoldingsTable";
import { CompletedTradesTable } from "@/components/CompletedTradesTable";
import { RefreshPricesButton } from "@/components/RefreshPricesButton";
import { evaluateAlertsForClient } from "@/lib/alerts";
import { dismissAlertAction } from "@/lib/actions";

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  const { id } = await params;
  const client = await getAuthorizedClient(id);
  if (!client) notFound();

  const [lots, completedTrades, payments] = await Promise.all([
    prisma.transaction.findMany({
      where: { clientId: id, deletedAt: null },
      orderBy: { tradeDate: "asc" },
    }),
    prisma.completedTrade.findMany({
      where: { clientId: id, deletedAt: null },
      orderBy: { sellDate: "desc" },
    }),
    prisma.payment.findMany({
      where: { clientId: id, deletedAt: null },
      orderBy: { date: "desc" },
    }),
  ]);

  const holdings = buildHoldings(lots);

  // Fetch prices
  const symbols = Array.from(
    new Set(holdings.map((h) => `${h.symbol}:${h.exchange}`))
  ).map((s) => {
    const [symbol, exchange] = s.split(":");
    return { symbol, exchange: exchange as "NSE" | "BSE" };
  });
  const priceMap = await getPrices(symbols);

  // Evaluate active alerts against current prices (fail-safe)
  await evaluateAlertsForClient(id, priceMap);

  // Load alerts (non-deleted) + trigger history for this client
  const [alerts, alertEvents] = await Promise.all([
    prisma.priceAlert.findMany({
      where: { clientId: id, deletedAt: null, status: { in: ["active", "triggered"] } },
    }),
    prisma.alertEvent.findMany({
      where: { clientId: id },
      orderBy: { triggeredAt: "desc" },
      take: 100,
    }),
  ]);
  const alertStatusById = new Map(alerts.map((a) => [a.id, a.status]));

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

  const canEdit = session.user.role !== "client";

  // Build price map as plain object for client components
  const pricesPlain: Record<string, number> = {};
  for (const [k, v] of priceMap.entries()) pricesPlain[k] = v;

  return (
    <AppShell role={session.user.role} userName={session.user.name || session.user.email} currentPath="/clients">
      <div style={{ marginBottom: "2rem" }}>
        <Link href="/clients" style={{ fontSize: "0.8rem", color: "#9ca3af" }}>← All clients</Link>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginTop: "0.75rem", gap: "1rem", flexWrap: "wrap" }}>
          <div>
            <h1 style={{ fontSize: "2rem", fontWeight: 700, letterSpacing: "-0.02em" }}>{client.name}</h1>
            <div style={{ color: "#9ca3af", marginTop: "0.35rem", fontSize: "0.875rem" }}>
              {client.email && <>📧 {client.email} &nbsp;·&nbsp; </>}
              {client.phone && <>📞 {client.phone}</>}
            </div>
            <div style={{ fontSize: "0.75rem", color: "#9ca3af", marginTop: "0.35rem" }}>
              Default commission: {client.defaultCommissionType === "percentage"
                ? `${client.defaultCommissionValue}%`
                : `₹${client.defaultCommissionValue} flat`}
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <RefreshPricesButton clientId={id} />
            {canEdit && (
              <>
                <Link href={`/clients/${id}/buy/new`} className="btn btn-primary">+ Buy</Link>
                <Link href={`/clients/${id}/import`} className="btn btn-ghost">Import CSV</Link>
                <Link href={`/clients/${id}/payments/new`} className="btn btn-ghost">+ Payment</Link>
                <Link href={`/clients/${id}/edit`} className="btn btn-ghost">Edit</Link>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem", marginBottom: "2rem" }}>
        <div className="glass stat-card">
          <div className="stat-label">Portfolio Value</div>
          <div className="stat-value">{inr(portfolioValue)}</div>
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
      </div>

      <SectionHeader title="Current Holdings" />
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
        clientId={id}
        defaultCommissionType={client.defaultCommissionType}
        defaultCommissionValue={client.defaultCommissionValue}
        canEdit={canEdit}
        alerts={alerts.map((a) => ({
          id: a.id,
          transactionId: a.transactionId,
          mode: a.mode,
          direction: a.direction,
          targetPrice: a.targetPrice,
          targetPercent: a.targetPercent,
          status: a.status,
          triggeredAt: a.triggeredAt?.toISOString() ?? null,
          triggeredPrice: a.triggeredPrice,
        }))}
      />

      {canEdit && alertEvents.length > 0 && (
        <>
          <div style={{ height: 32 }} />
          <SectionHeader title="Alert History" />
          <div className="glass" style={{ overflow: "hidden" }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Triggered At</th>
                  <th>Symbol</th>
                  <th>Details</th>
                  <th style={{ textAlign: "right" }}>Price</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {alertEvents.map((e) => {
                  const status = alertStatusById.get(e.alertId);
                  const isTriggered = status === "triggered";
                  return (
                    <tr key={e.id} style={isTriggered ? { background: "rgba(245, 158, 11, 0.08)" } : undefined}>
                      <td style={{ color: "#9ca3af", fontSize: "0.8rem", whiteSpace: "nowrap" }}>
                        {fmtDateTime(e.triggeredAt)} IST
                      </td>
                      <td style={{ fontWeight: 600 }}>{e.symbol}</td>
                      <td style={{ fontSize: "0.8rem", color: "#9ca3af" }}>{e.message}</td>
                      <td style={{ textAlign: "right" }}>{inr(e.priceAtTrigger)}</td>
                      <td>
                        <span className="badge" style={isTriggered
                          ? { background: "rgba(245,158,11,0.15)", color: "#fbbf24", border: "1px solid rgba(245,158,11,0.35)" }
                          : { background: "rgba(255,255,255,0.06)", color: "#9ca3af" }}>
                          {isTriggered ? "TRIGGERED" : status === "active" ? "RE-ARMED" : "DISMISSED"}
                        </span>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {isTriggered && (
                          <form action={dismissAlertAction}>
                            <input type="hidden" name="alertId" value={e.alertId} />
                            <button type="submit" className="btn btn-ghost" style={{ fontSize: "0.7rem", padding: "0.3rem 0.7rem" }}>Dismiss</button>
                          </form>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div style={{ height: 32 }} />

      <SectionHeader title="Completed Trades — Realized P&L" />
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
        canEdit={canEdit}
      />

      <div style={{ height: 32 }} />

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
    <h2 style={{ fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.75rem", color: "#a78bfa", textTransform: "uppercase", letterSpacing: "0.08em" }}>
      {title}
    </h2>
  );
}
