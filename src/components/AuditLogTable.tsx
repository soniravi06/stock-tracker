"use client";

import { useState, Fragment } from "react";

type AuditEntry = {
  id: string;
  createdAt: string;
  actorName: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string;
  summary: string | null;
  onBehalfOfAdminId: string | null;
  beforeJson: string | null;
  afterJson: string | null;
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

function formatFieldValue(key: string, val: unknown): string {
  if (val === null || val === undefined) return "—";
  const moneyKeys = [
    "sellPricePerShare", "pricePerShare", "commissionAmount", "netPnL",
    "grossPnL", "totalBuyCost", "totalSellProceeds", "avgBuyPrice", "amount",
  ];
  if (moneyKeys.includes(key) && typeof val === "number") return inr(val);
  if (typeof val === "string" && val.match(/^\d{4}-\d{2}-\d{2}T/)) {
    return fmtDate(val);
  }
  if (typeof val === "object") return JSON.stringify(val);
  return String(val);
}

const SKIP_KEYS = new Set([
  "id", "clientId", "createdByUserId", "updatedAt", "createdAt",
  "matchedLotsJson", "deletedAt", "adminId", "linkedClientId", "passwordHash",
]);

function DiffView({ before, after }: { before: string | null; after: string | null }) {
  const b: Record<string, unknown> = before ? JSON.parse(before) : {};
  const a: Record<string, unknown> = after ? JSON.parse(after) : {};

  const allKeys = Array.from(
    new Set([...Object.keys(b), ...Object.keys(a)])
  ).filter((k) => !SKIP_KEYS.has(k));

  const changed = allKeys.filter((k) => JSON.stringify(b[k]) !== JSON.stringify(a[k]));
  const unchanged = allKeys.filter((k) => JSON.stringify(b[k]) === JSON.stringify(a[k]));

  if (allKeys.length === 0) {
    return <div style={{ color: "#6b7280", fontSize: "0.75rem" }}>No field data recorded.</div>;
  }

  return (
    <div style={{ fontSize: "0.75rem" }}>
      {changed.length > 0 && (
        <>
          <div style={{ color: "#a78bfa", marginBottom: "0.35rem", textTransform: "uppercase", letterSpacing: "0.05em", fontSize: "0.65rem" }}>
            Changed fields
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "0.75rem" }}>
            <thead>
              <tr style={{ color: "#6b7280", fontSize: "0.65rem" }}>
                <th style={{ textAlign: "left", padding: "0.2rem 0.4rem", width: "25%" }}>Field</th>
                <th style={{ textAlign: "left", padding: "0.2rem 0.4rem", width: "37.5%" }}>Before</th>
                <th style={{ textAlign: "left", padding: "0.2rem 0.4rem", width: "37.5%" }}>After</th>
              </tr>
            </thead>
            <tbody>
              {changed.map((k) => (
                <tr key={k} style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                  <td style={{ padding: "0.25rem 0.4rem", color: "#9ca3af", fontFamily: "monospace" }}>{k}</td>
                  <td style={{ padding: "0.25rem 0.4rem", color: "#fca5a5" }}>{formatFieldValue(k, b[k])}</td>
                  <td style={{ padding: "0.25rem 0.4rem", color: "#86efac" }}>{formatFieldValue(k, a[k])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {unchanged.length > 0 && (
        <>
          <div style={{ color: "#4b5563", marginBottom: "0.35rem", textTransform: "uppercase", letterSpacing: "0.05em", fontSize: "0.65rem" }}>
            Unchanged fields
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              {unchanged.map((k) => (
                <tr key={k} style={{ borderTop: "1px solid rgba(255,255,255,0.03)" }}>
                  <td style={{ padding: "0.2rem 0.4rem", color: "#4b5563", fontFamily: "monospace", width: "25%" }}>{k}</td>
                  <td style={{ padding: "0.2rem 0.4rem", color: "#4b5563" }}>{formatFieldValue(k, a[k] ?? b[k])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

const ACTION_COLOR: Record<string, string> = {
  create: "#86efac",
  update: "#93c5fd",
  soft_delete: "#fca5a5",
  restore: "#fcd34d",
};

export function AuditLogTable({ entries }: { entries: AuditEntry[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  };

  return (
    <div className="glass" style={{ overflow: "hidden" }}>
      <table className="data">
        <thead>
          <tr>
            <th style={{ width: 36 }}></th>
            <th>When</th>
            <th>Actor</th>
            <th>Action</th>
            <th>What happened</th>
            <th>On behalf of</th>
          </tr>
        </thead>
        <tbody>
          {entries.length === 0 && (
            <tr>
              <td colSpan={6} style={{ textAlign: "center", color: "#9ca3af", padding: "2rem" }}>
                No activity yet.
              </td>
            </tr>
          )}
          {entries.map((l) => {
            const isExpanded = expanded.has(l.id);
            const hasDiff = l.beforeJson || l.afterJson;
            return (
              <Fragment key={l.id}>
                <tr
                  style={{ cursor: hasDiff ? "pointer" : "default" }}
                  onClick={() => hasDiff && toggle(l.id)}
                >
                  <td style={{ color: "#9ca3af", fontSize: "0.75rem" }}>
                    {hasDiff ? (isExpanded ? "▼" : "▶") : ""}
                  </td>
                  <td style={{ fontSize: "0.8rem" }}>
                    {fmtDate(l.createdAt)}
                    <br />
                    <span style={{ color: "#6b7280", fontSize: "0.7rem" }}>
                      {new Date(l.createdAt).toLocaleTimeString("en-IN")}
                    </span>
                  </td>
                  <td>
                    <div>{l.actorName}</div>
                    <span
                      className="badge"
                      style={{ background: "rgba(124, 92, 255, 0.15)", color: "#c4b5fd", fontSize: "0.65rem" }}
                    >
                      {l.actorRole}
                    </span>
                  </td>
                  <td>
                    <span style={{ color: ACTION_COLOR[l.action] ?? "#e6e7ee", fontWeight: 600 }}>
                      {l.action}
                    </span>
                    <div style={{ fontSize: "0.65rem", color: "#6b7280" }}>{l.entityType}</div>
                  </td>
                  <td style={{ color: "#d1d5db", fontSize: "0.8rem" }}>
                    {l.summary ?? `${l.action} ${l.entityType}`}
                    {l.onBehalfOfAdminId && (
                      <div style={{ fontSize: "0.65rem", color: "#f59e0b", marginTop: 2 }}>
                        on behalf of admin
                      </div>
                    )}
                  </td>
                  <td style={{ color: "#4b5563", fontSize: "0.75rem", fontFamily: "monospace" }}>
                    {l.onBehalfOfAdminId ? l.onBehalfOfAdminId.slice(0, 8) + "…" : "—"}
                  </td>
                </tr>
                {isExpanded && hasDiff && (
                  <tr>
                    <td></td>
                    <td colSpan={5} style={{ padding: 0 }}>
                      <div
                        style={{
                          padding: "0.75rem 1rem 1rem",
                          background: "rgba(124, 92, 255, 0.04)",
                          borderTop: "1px solid rgba(255,255,255,0.04)",
                        }}
                      >
                        <DiffView before={l.beforeJson} after={l.afterJson} />
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
  );
}
