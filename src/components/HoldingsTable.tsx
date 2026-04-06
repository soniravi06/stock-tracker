"use client";

import { useState, Fragment } from "react";
import { sellFromHoldingAction, editBuyLotAction, deleteBuyLotAction } from "@/lib/actions";

type Lot = {
  transactionId: string;
  buyDate: string;
  originalQty: number;
  remainingQty: number;
  pricePerShare: number;
};

type Holding = {
  symbol: string;
  exchange: "NSE" | "BSE";
  totalQty: number;
  avgCostPerShare: number;
  totalCostBasis: number;
  lots: Lot[];
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

export function HoldingsTable({
  holdings,
  prices,
  clientId,
  defaultCommissionType,
  defaultCommissionValue,
  canEdit,
}: {
  holdings: Holding[];
  prices: Record<string, number>;
  clientId: string;
  defaultCommissionType: "percentage" | "flat";
  defaultCommissionValue: number;
  canEdit: boolean;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [sellFor, setSellFor] = useState<Holding | null>(null);
  const [editLot, setEditLot] = useState<Lot | null>(null);

  const toggle = (sym: string) => {
    setExpanded((prev) => {
      const s = new Set(prev);
      if (s.has(sym)) s.delete(sym); else s.add(sym);
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
              <th>Symbol</th>
              <th style={{ textAlign: "right" }}>Qty</th>
              <th style={{ textAlign: "right" }}>Avg Buy</th>
              <th style={{ textAlign: "right" }}>Current</th>
              <th style={{ textAlign: "right" }}>Market Value</th>
              <th style={{ textAlign: "right" }}>Unrealized</th>
              {canEdit && <th></th>}
            </tr>
          </thead>
          <tbody>
            {holdings.length === 0 && (
              <tr><td colSpan={canEdit ? 8 : 7} style={{ textAlign: "center", color: "#9ca3af", padding: "2rem" }}>No open positions.</td></tr>
            )}
            {holdings.map((h) => {
              const isExpanded = expanded.has(h.symbol);
              const px = prices[h.symbol];
              const mv = px != null ? px * h.totalQty : null;
              const unrl = px != null ? (px - h.avgCostPerShare) * h.totalQty : null;
              return (
                <Fragment key={h.symbol}>
                  <tr style={{ cursor: "pointer" }} onClick={() => toggle(h.symbol)}>
                    <td style={{ color: "#9ca3af", fontSize: "0.75rem" }}>{isExpanded ? "▼" : "▶"}</td>
                    <td style={{ fontWeight: 600 }}>
                      {h.symbol}
                      <span style={{ color: "#6b7280", fontSize: "0.7rem", marginLeft: 6 }}>{h.exchange}</span>
                      {h.lots.length > 1 && (
                        <span style={{ color: "#7c5cff", fontSize: "0.7rem", marginLeft: 6 }}>({h.lots.length} lots)</span>
                      )}
                    </td>
                    <td style={{ textAlign: "right" }}>{fmtNum(h.totalQty)}</td>
                    <td style={{ textAlign: "right" }}>{inr(h.avgCostPerShare)}</td>
                    <td style={{ textAlign: "right" }}>{px != null ? inr(px) : "—"}</td>
                    <td style={{ textAlign: "right" }}>{mv != null ? inr(mv) : "—"}</td>
                    <td style={{ textAlign: "right" }} className={(unrl ?? 0) >= 0 ? "pos" : "neg"}>
                      {unrl != null ? inr(unrl) : "—"}
                    </td>
                    {canEdit && (
                      <td style={{ textAlign: "right" }}>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setSellFor(h); }}
                          className="btn btn-primary"
                          style={{ fontSize: "0.7rem", padding: "0.3rem 0.7rem" }}
                        >
                          Sell
                        </button>
                      </td>
                    )}
                  </tr>
                  {isExpanded && (
                    <tr>
                      <td></td>
                      <td colSpan={canEdit ? 7 : 6} style={{ padding: 0 }}>
                        <div style={{ padding: "0.5rem 1rem 1rem", background: "rgba(124, 92, 255, 0.04)" }}>
                          <div style={{ fontSize: "0.7rem", color: "#a78bfa", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.5rem" }}>Underlying buy lots</div>
                          <table style={{ width: "100%", fontSize: "0.8rem" }}>
                            <thead>
                              <tr style={{ color: "#9ca3af", fontSize: "0.7rem" }}>
                                <th style={{ textAlign: "left", padding: "0.35rem 0.5rem" }}>Buy Date</th>
                                <th style={{ textAlign: "right", padding: "0.35rem 0.5rem" }}>Original Qty</th>
                                <th style={{ textAlign: "right", padding: "0.35rem 0.5rem" }}>Remaining</th>
                                <th style={{ textAlign: "right", padding: "0.35rem 0.5rem" }}>Buy Price</th>
                                <th style={{ textAlign: "right", padding: "0.35rem 0.5rem" }}>Cost Basis</th>
                                {canEdit && <th style={{ padding: "0.35rem 0.5rem" }}></th>}
                              </tr>
                            </thead>
                            <tbody>
                              {h.lots.map((l) => (
                                <tr key={l.transactionId}>
                                  <td style={{ padding: "0.35rem 0.5rem" }}>{fmtDate(l.buyDate)}</td>
                                  <td style={{ textAlign: "right", padding: "0.35rem 0.5rem" }}>{fmtNum(l.originalQty)}</td>
                                  <td style={{ textAlign: "right", padding: "0.35rem 0.5rem" }}>
                                    {fmtNum(l.remainingQty)}
                                    {l.remainingQty < l.originalQty && (
                                      <span style={{ color: "#9ca3af", fontSize: "0.7rem" }}> (partial)</span>
                                    )}
                                  </td>
                                  <td style={{ textAlign: "right", padding: "0.35rem 0.5rem" }}>{inr(l.pricePerShare)}</td>
                                  <td style={{ textAlign: "right", padding: "0.35rem 0.5rem" }}>{inr(l.remainingQty * l.pricePerShare)}</td>
                                  {canEdit && (
                                    <td style={{ textAlign: "right", padding: "0.35rem 0.5rem" }}>
                                      <button
                                        type="button"
                                        className="btn btn-ghost"
                                        style={{ fontSize: "0.65rem", padding: "0.2rem 0.5rem" }}
                                        onClick={() => setEditLot(l)}
                                        disabled={l.remainingQty < l.originalQty}
                                        title={l.remainingQty < l.originalQty ? "Cannot edit: shares sold from this lot" : "Edit lot"}
                                      >
                                        Edit
                                      </button>
                                    </td>
                                  )}
                                </tr>
                              ))}
                            </tbody>
                          </table>
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

      {sellFor && (
        <SellModal
          holding={sellFor}
          clientId={clientId}
          defaultCommissionType={defaultCommissionType}
          defaultCommissionValue={defaultCommissionValue}
          currentPrice={prices[sellFor.symbol]}
          onClose={() => setSellFor(null)}
        />
      )}

      {editLot && (
        <EditLotModal lot={editLot} onClose={() => setEditLot(null)} />
      )}
    </>
  );
}

function SellModal({
  holding,
  clientId,
  defaultCommissionType,
  defaultCommissionValue,
  currentPrice,
  onClose,
}: {
  holding: Holding;
  clientId: string;
  defaultCommissionType: "percentage" | "flat";
  defaultCommissionValue: number;
  currentPrice?: number;
  onClose: () => void;
}) {
  const [sellQty, setSellQty] = useState<string>(String(holding.totalQty));
  const [sellPrice, setSellPrice] = useState<string>(currentPrice?.toFixed(2) ?? "");
  const [commissionType, setCommissionType] = useState(defaultCommissionType);
  const [commissionValue, setCommissionValue] = useState<string>(String(defaultCommissionValue));

  const qty = parseFloat(sellQty) || 0;
  const price = parseFloat(sellPrice) || 0;
  const cv = parseFloat(commissionValue) || 0;
  const proceeds = qty * price;
  const commission = commissionType === "percentage" ? (proceeds * cv) / 100 : cv;
  const grossBuyCost = qty * holding.avgCostPerShare;
  const grossPnL = proceeds - grossBuyCost;
  const netPnL = grossPnL - commission;

  return (
    <Modal onClose={onClose} title={`Sell ${holding.symbol}`}>
      <form action={sellFromHoldingAction} onSubmit={() => setTimeout(onClose, 100)}>
        <input type="hidden" name="clientId" value={clientId} />
        <input type="hidden" name="symbol" value={holding.symbol} />

        <div style={{ fontSize: "0.8rem", color: "#9ca3af", marginBottom: "1rem" }}>
          You have <strong style={{ color: "#e6e7ee" }}>{fmtNum(holding.totalQty)}</strong> shares at avg cost <strong style={{ color: "#e6e7ee" }}>{inr(holding.avgCostPerShare)}</strong>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "0.75rem" }}>
          <div>
            <label className="label">Sell Qty *</label>
            <input
              className="input"
              type="number"
              name="sellQty"
              required
              value={sellQty}
              max={holding.totalQty}
              step="any"
              onChange={(e) => setSellQty(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Sell Price/Share *</label>
            <input
              className="input"
              type="number"
              name="sellPrice"
              required
              value={sellPrice}
              step="0.01"
              onChange={(e) => setSellPrice(e.target.value)}
            />
          </div>
        </div>

        <div style={{ marginBottom: "0.75rem" }}>
          <label className="label">Sell Date *</label>
          <input className="input" type="date" name="sellDate" required defaultValue={new Date().toISOString().slice(0, 10)} />
        </div>

        <div style={{ padding: "0.85rem", background: "rgba(124, 92, 255, 0.06)", borderRadius: 10, border: "1px solid rgba(124, 92, 255, 0.15)", marginBottom: "0.75rem" }}>
          <div style={{ fontSize: "0.75rem", color: "#a78bfa", marginBottom: "0.5rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>Commission for this trade</div>
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
          <Row label="Buy Cost" value={`− ${inr(grossBuyCost)}`} />
          <Row label="Commission" value={`− ${inr(commission)}`} />
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", margin: "0.5rem 0" }}></div>
          <Row
            label="Net P&L"
            value={inr(netPnL)}
            valueClass={netPnL >= 0 ? "pos" : "neg"}
            bold
          />
        </div>

        <div>
          <label className="label">Notes</label>
          <input className="input" name="notes" placeholder="Optional" />
        </div>

        <div style={{ display: "flex", gap: "0.5rem", marginTop: "1.25rem", justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary">Confirm Sell</button>
        </div>
      </form>
    </Modal>
  );
}

function EditLotModal({ lot, onClose }: { lot: Lot; onClose: () => void }) {
  return (
    <Modal onClose={onClose} title="Edit Buy Lot">
      <form action={editBuyLotAction} onSubmit={() => setTimeout(onClose, 100)}>
        <input type="hidden" name="lotId" value={lot.transactionId} />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "0.75rem" }}>
          <div>
            <label className="label">Quantity *</label>
            <input className="input" type="number" name="quantity" required step="any" defaultValue={lot.originalQty} />
          </div>
          <div>
            <label className="label">Price/Share *</label>
            <input className="input" type="number" name="pricePerShare" required step="0.01" defaultValue={lot.pricePerShare} />
          </div>
        </div>

        <div style={{ marginBottom: "0.75rem" }}>
          <label className="label">Trade Date *</label>
          <input className="input" type="date" name="tradeDate" required defaultValue={lot.buyDate.slice(0, 10)} />
        </div>

        <div>
          <label className="label">Notes</label>
          <input className="input" name="notes" />
        </div>

        <div style={{ display: "flex", gap: "0.5rem", marginTop: "1.25rem", justifyContent: "space-between" }}>
          <button
            type="submit"
            formAction={deleteBuyLotAction}
            className="btn btn-danger"
            onClick={(e) => {
              if (!confirm("Delete this buy lot? This is a soft delete.")) e.preventDefault();
            }}
          >
            Delete Lot
          </button>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary">Save Changes</button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

function Modal({ children, title, onClose }: { children: React.ReactNode; title: string; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 50,
        display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem", backdropFilter: "blur(4px)"
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="glass"
        style={{ width: "100%", maxWidth: 520, padding: "1.75rem", maxHeight: "90vh", overflowY: "auto" }}
      >
        <h2 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: "1.25rem", letterSpacing: "-0.01em" }}>{title}</h2>
        {children}
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
