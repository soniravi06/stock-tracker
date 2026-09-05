"use client";

import { useState } from "react";
import {
  markPaymentReceivedAction,
  editPaymentAction,
  deletePaymentAction,
} from "@/lib/actions";

export type PaymentRow = {
  id: string;
  clientId: string;
  clientName: string;
  amount: number;
  direction: "in" | "out";
  status: "pending" | "received";
  date: string; // ISO
  notes: string | null;
};

function inr(n: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(n);
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function PaymentsTable({
  rows,
  canEdit,
}: {
  rows: PaymentRow[];
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState<PaymentRow | null>(null);

  return (
    <>
      <div className="glass" style={{ overflow: "hidden" }}>
        <table className="data">
          <thead>
            <tr>
              <th>Date</th>
              <th>Client</th>
              <th>Direction</th>
              <th style={{ textAlign: "right" }}>Amount</th>
              <th>Status</th>
              <th>Notes</th>
              {canEdit && <th style={{ textAlign: "right" }}>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={canEdit ? 7 : 6} style={{ textAlign: "center", color: "#9ca3af", padding: "2rem" }}>
                  No payments match these filters.
                </td>
              </tr>
            )}
            {rows.map((p) => (
              <tr key={p.id}>
                <td style={{ color: "#9ca3af", fontSize: "0.8rem" }}>{fmtDate(p.date)}</td>
                <td style={{ fontWeight: 600 }}>{p.clientName}</td>
                <td>{p.direction === "in" ? "Deposit" : "Withdrawal"}</td>
                <td style={{ textAlign: "right", fontWeight: 600 }} className={p.direction === "in" ? "pos" : "neg"}>
                  {p.direction === "in" ? "+" : "−"} {inr(p.amount)}
                </td>
                <td>
                  <span className={`badge badge-${p.status}`}>{p.status}</span>
                </td>
                <td style={{ color: "#9ca3af", fontSize: "0.8rem" }}>{p.notes || "—"}</td>
                {canEdit && (
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    {p.status === "pending" && (
                      <form action={markPaymentReceivedAction} style={{ display: "inline" }}>
                        <input type="hidden" name="paymentId" value={p.id} />
                        <button type="submit" className="btn btn-primary" style={{ fontSize: "0.7rem", padding: "0.3rem 0.7rem", marginRight: 6 }}>
                          Mark received
                        </button>
                      </form>
                    )}
                    <button
                      type="button"
                      onClick={() => setEditing(p)}
                      className="btn btn-ghost"
                      style={{ fontSize: "0.7rem", padding: "0.3rem 0.7rem" }}
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

      {editing && <EditPaymentModal payment={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function EditPaymentModal({ payment, onClose }: { payment: PaymentRow; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem", backdropFilter: "blur(4px)" }}
    >
      <div onClick={(e) => e.stopPropagation()} className="glass" style={{ width: "100%", maxWidth: 480, padding: "1.75rem", maxHeight: "90vh", overflowY: "auto" }}>
        <h2 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: "0.25rem" }}>Edit Payment</h2>
        <div style={{ fontSize: "0.8rem", color: "#9ca3af", marginBottom: "1.25rem" }}>{payment.clientName}</div>

        <form action={editPaymentAction} onSubmit={() => setTimeout(onClose, 100)}>
          <input type="hidden" name="paymentId" value={payment.id} />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "0.75rem" }}>
            <div>
              <label className="label">Amount *</label>
              <input className="input" type="number" name="amount" step="0.01" required defaultValue={payment.amount} />
            </div>
            <div>
              <label className="label">Date *</label>
              <input className="input" type="date" name="date" required defaultValue={payment.date.slice(0, 10)} />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "0.75rem" }}>
            <div>
              <label className="label">Direction</label>
              <select className="select" name="direction" defaultValue={payment.direction}>
                <option value="in">Deposit (in)</option>
                <option value="out">Withdrawal (out)</option>
              </select>
            </div>
            <div>
              <label className="label">Status</label>
              <select className="select" name="status" defaultValue={payment.status}>
                <option value="pending">Pending</option>
                <option value="received">Received</option>
              </select>
            </div>
          </div>

          <div>
            <label className="label">Notes</label>
            <input className="input" name="notes" defaultValue={payment.notes || ""} />
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: "1.25rem" }}>
            <button
              type="submit"
              formAction={deletePaymentAction}
              className="btn btn-danger"
              onClick={(e) => {
                if (!confirm("Delete this payment?")) e.preventDefault();
              }}
            >
              Delete
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
