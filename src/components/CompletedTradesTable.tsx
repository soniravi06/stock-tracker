"use client";

import { useState, Fragment } from "react";
import { editCompletedTradeAction, deleteCompletedTradeAction } from "@/lib/actions";

type MatchedLot = {
  buyTransactionId: string;
  buyDate: string;
  buyPrice: number;
  qty: number;
};

type CompletedTrade = {
  id: string;
  symbol: string;
  sellDate: string;
  sellQty: number;
  sellPricePerShare: number;
  avgBuyPrice: number;
  grossPnL: number;
  commissionType: "percentage" | "flat";
  commissionValue: number;
  commissionAmount: number;
  netPnL: number;
  matchedLotsJson: string;
  notes: string | null;
};

function inr(n: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(n);
}

function fmtNum(n: number): string {
  return n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function CompletedTradesTable({
  trades,
  canEdit,
}: {
  trades: CompletedTrade[];
  canEdit: boolean;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<CompletedTrade | null>(null);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  };

  return (
    <>
      <div className="glass" style={{ overflow: "hidden" }}>
        <table className="data">
          <thead>
            <tr>
              <th style={{ width: 36 }}></th>
              <th>Sell Date</th>
              <th>Symbol</th>
              <th style={{ textAlign: "right" }}>Qty</th>
              <th style={{ textAlign: "right" }}>Avg Buy</th>
              <th style={{ textAlign: "right" }}>Sell Price</th>
              <th style={{ textAlign: "right" }}>Gross P&L</th>
              <th style={{ textAlign: "right" }}>Commission</th>
              <th style={{ textAlign: "right" }}>Net P&L</th>
              {canEdit && <th></th>}
            </tr>
          </thead>
          <tbody>
            {trades.length === 0 && (
              <tr><td colSpan={canEdit ? 10 : 9} style={{ textAlign: "center", color: "#9ca3af", padding: "2rem" }}>No completed trades yet.</td></tr>
            )}
            {trades.map((t) => {
              const isExpanded = expanded.has(t.id);
              const matches = JSON.parse(t.matchedLotsJson) as MatchedLot[];
              return (
                <Fragment key={t.id}>
                  <tr style={{ cursor: "pointer" }} onClick={() => toggle(t.id)}>
                    <td style={{ color: "#9ca3af", fontSize: "0.75rem" }}>{isExpanded ? "▼" : "▶"}</td>
                    <td>{fmtDate(t.sellDate)}</td>
                    <td style={{ fontWeight: 600 }}>
                      {t.symbol}
                      {matches.length > 1 && (
                        <span style={{ color: "#7c5cff", fontSize: "0.7rem", marginLeft: 6 }}>({matches.length} lots)</span>
                      )}
                    </td>
                    <td style={{ textAlign: "right" }}>{fmtNum(t.sellQty)}</td>
                    <td style={{ textAlign: "right" }}>{inr(t.avgBuyPrice)}</td>
                    <td style={{ textAlign: "right" }}>{inr(t.sellPricePerShare)}</td>
                    <td style={{ textAlign: "right" }} className={t.grossPnL >= 0 ? "pos" : "neg"}>{inr(t.grossPnL)}</td>
                    <td style={{ textAlign: "right", color: "#9ca3af" }}>
                      {inr(t.commissionAmount)}
                      <div style={{ fontSize: "0.65rem" }}>
                        ({t.commissionType === "percentage" ? `${t.commissionValue}%` : `₹${t.commissionValue} flat`})
                      </div>
                    </td>
                    <td style={{ textAlign: "right", fontWeight: 700 }} className={t.netPnL >= 0 ? "pos" : "neg"}>{inr(t.netPnL)}</td>
                    {canEdit && (
                      <td style={{ textAlign: "right" }}>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setEditing(t); }}
                          className="btn btn-ghost"
                          style={{ fontSize: "0.7rem", padding: "0.3rem 0.6rem" }}
                        >
                          Edit
                        </button>
                      </td>
                    )}
                  </tr>
                  {isExpanded && (
                    <tr>
                      <td></td>
                      <td colSpan={canEdit ? 9 : 8} style={{ padding: 0 }}>
                        <div style={{ padding: "0.5rem 1rem 1rem", background: "rgba(124, 92, 255, 0.04)" }}>
                          <div style={{ fontSize: "0.7rem", color: "#a78bfa", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.5rem" }}>
                            FIFO Match — {matches.length} lot{matches.length === 1 ? "" : "s"}
                          </div>
                          <table style={{ width: "100%", fontSize: "0.8rem" }}>
                            <thead>
                              <tr style={{ color: "#9ca3af", fontSize: "0.7rem" }}>
                                <th style={{ textAlign: "left", padding: "0.35rem 0.5rem" }}>Buy Date</th>
                                <th style={{ textAlign: "right", padding: "0.35rem 0.5rem" }}>Qty Taken</th>
                                <th style={{ textAlign: "right", padding: "0.35rem 0.5rem" }}>Buy Price</th>
                                <th style={{ textAlign: "right", padding: "0.35rem 0.5rem" }}>Sell Price</th>
                                <th style={{ textAlign: "right", padding: "0.35rem 0.5rem" }}>Lot P&L (gross)</th>
                              </tr>
                            </thead>
                            <tbody>
                              {matches.map((m, i) => {
                                const lotPnL = (t.sellPricePerShare - m.buyPrice) * m.qty;
                                return (
                                  <tr key={i}>
                                    <td style={{ padding: "0.35rem 0.5rem" }}>{fmtDate(m.buyDate)}</td>
                                    <td style={{ textAlign: "right", padding: "0.35rem 0.5rem" }}>{fmtNum(m.qty)}</td>
                                    <td style={{ textAlign: "right", padding: "0.35rem 0.5rem" }}>{inr(m.buyPrice)}</td>
                                    <td style={{ textAlign: "right", padding: "0.35rem 0.5rem" }}>{inr(t.sellPricePerShare)}</td>
                                    <td style={{ textAlign: "right", padding: "0.35rem 0.5rem" }} className={lotPnL >= 0 ? "pos" : "neg"}>{inr(lotPnL)}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                          {t.notes && (
                            <div style={{ marginTop: "0.75rem", fontSize: "0.75rem", color: "#9ca3af" }}>
                              <strong>Notes:</strong> {t.notes}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {editing && (
        <EditTradeModal trade={editing} onClose={() => setEditing(null)} />
      )}
    </>
  );
}

function EditTradeModal({ trade, onClose }: { trade: CompletedTrade; onClose: () => void }) {
  const [sellPrice, setSellPrice] = useState(String(trade.sellPricePerShare));
  const [commissionType, setCommissionType] = useState(trade.commissionType);
  const [commissionValue, setCommissionValue] = useState(String(trade.commissionValue));

  const price = parseFloat(sellPrice) || 0;
  const cv = parseFloat(commissionValue) || 0;
  const proceeds = trade.sellQty * price;
  const commission = commissionType === "percentage" ? (proceeds * cv) / 100 : cv;
  const totalBuyCost = trade.avgBuyPrice * trade.sellQty;
  const grossPnL = proceeds - totalBuyCost;
  const netPnL = grossPnL - commission;

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem", backdropFilter: "blur(4px)" }}
    >
      <div onClick={(e) => e.stopPropagation()} className="glass" style={{ width: "100%", maxWidth: 520, padding: "1.75rem", maxHeight: "90vh", overflowY: "auto" }}>
        <h2 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: "1.25rem" }}>Edit Completed Trade</h2>
        <div style={{ fontSize: "0.8rem", color: "#9ca3af", marginBottom: "1rem" }}>
          {trade.symbol} · {fmtNum(trade.sellQty)} shares · avg buy {inr(trade.avgBuyPrice)}
        </div>

        <form action={editCompletedTradeAction} onSubmit={() => setTimeout(onClose, 100)}>
          <input type="hidden" name="tradeId" value={trade.id} />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "0.75rem" }}>
            <div>
              <label className="label">Sell Price/Share *</label>
              <input className="input" type="number" name="sellPrice" step="0.01" required value={sellPrice} onChange={(e) => setSellPrice(e.target.value)} />
            </div>
            <div>
              <label className="label">Sell Date *</label>
              <input className="input" type="date" name="sellDate" required defaultValue={trade.sellDate.slice(0, 10)} />
            </div>
          </div>

          <div style={{ padding: "0.85rem", background: "rgba(124, 92, 255, 0.06)", borderRadius: 10, border: "1px solid rgba(124, 92, 255, 0.15)", marginBottom: "0.75rem" }}>
            <div style={{ fontSize: "0.75rem", color: "#a78bfa", marginBottom: "0.5rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>Commission</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
              <select className="select" name="commissionType" value={commissionType} onChange={(e) => setCommissionType(e.target.value as any)}>
                <option value="percentage">Percentage (%)</option>
                <option value="flat">Flat (₹)</option>
              </select>
              <input className="input" type="number" name="commissionValue" step="0.01" value={commissionValue} onChange={(e) => setCommissionValue(e.target.value)} />
            </div>
          </div>

          <div style={{ padding: "0.85rem", background: "rgba(255,255,255,0.03)", borderRadius: 10, marginBottom: "1rem", fontSize: "0.8rem" }}>
            <Row label="Sale Proceeds" value={inr(proceeds)} />
            <Row label="Buy Cost" value={`− ${inr(totalBuyCost)}`} />
            <Row label="Commission" value={`− ${inr(commission)}`} />
            <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", margin: "0.5rem 0" }}></div>
            <Row label="Net P&L" value={inr(netPnL)} valueClass={netPnL >= 0 ? "pos" : "neg"} bold />
          </div>

          <div>
            <label className="label">Notes</label>
            <input className="input" name="notes" defaultValue={trade.notes || ""} />
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: "1.25rem" }}>
            <button
              type="submit"
              formAction={deleteCompletedTradeAction}
              className="btn btn-danger"
              onClick={(e) => {
                if (!confirm("Delete this trade? The sold shares will be restored to holdings.")) e.preventDefault();
              }}
            >
              Delete & Restore Lots
            </button>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn btn-primary">Save Changes</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function Row({ label, value, valueClass, bold }: { label: string; value: string; valueClass?: string; bold?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "0.2rem 0" }}>
      <span style={{ color: "#9ca3af" }}>{label}</span>
      <span className={valueClass} style={{ fontWeight: bold ? 700 : 500 }}>{value}</span>
    </div>
  );
}
