"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { importBuyLotsAction } from "@/lib/actions";

type Row = {
  symbol: string;
  exchange: "NSE" | "BSE";
  quantity: number;
  pricePerShare: number;
  tradeDate: string;
  notes?: string | null;
};

type ParsedRow = Row & { rowNum: number; errors: string[] };

const TEMPLATE = `symbol,exchange,quantity,pricePerShare,tradeDate,notes
RELIANCE,NSE,10,2450.50,2024-01-15,First lot
TCS,NSE,5,3890.00,2024-02-01,
INFY,BSE,20,1520.25,2024-03-10,Bought on dip`;

function parseCsv(text: string): ParsedRow[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== "");
  if (lines.length === 0) return [];

  // Detect & skip header
  const first = lines[0].toLowerCase();
  const dataLines = first.includes("symbol") && first.includes("quantity") ? lines.slice(1) : lines;

  return dataLines.map((line, i) => {
    const rowNum = i + (dataLines === lines ? 1 : 2);
    const cols = line.split(",").map((c) => c.trim());
    const [symbol = "", exchangeRaw = "NSE", qtyRaw = "", priceRaw = "", dateRaw = "", notes = ""] = cols;

    const errors: string[] = [];
    const sym = symbol.toUpperCase();
    if (!sym) errors.push("symbol required");

    const exchange = exchangeRaw.toUpperCase() === "BSE" ? "BSE" : "NSE";
    if (exchangeRaw && !["NSE", "BSE"].includes(exchangeRaw.toUpperCase())) {
      errors.push(`exchange must be NSE or BSE (got "${exchangeRaw}")`);
    }

    const quantity = parseFloat(qtyRaw);
    if (!(quantity > 0)) errors.push("quantity must be > 0");

    const pricePerShare = parseFloat(priceRaw);
    if (!(pricePerShare > 0)) errors.push("pricePerShare must be > 0");

    let tradeDate = dateRaw;
    const d = new Date(dateRaw);
    if (isNaN(d.getTime())) {
      errors.push("invalid tradeDate (use YYYY-MM-DD)");
    } else {
      tradeDate = d.toISOString().slice(0, 10);
    }

    return {
      rowNum,
      symbol: sym,
      exchange,
      quantity: isNaN(quantity) ? 0 : quantity,
      pricePerShare: isNaN(pricePerShare) ? 0 : pricePerShare,
      tradeDate,
      notes: notes || null,
      errors,
    };
  });
}

export function CsvImport({ clientId }: { clientId: string }) {
  const router = useRouter();
  const [rows, setRows] = useState<ParsedRow[] | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<string>("");

  const validRows = rows?.filter((r) => r.errors.length === 0) ?? [];
  const invalidCount = (rows?.length ?? 0) - validRows.length;

  const onFile = (file: File) => {
    setFileName(file.name);
    setResult("");
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      setRows(parseCsv(text));
    };
    reader.readAsText(file);
  };

  const downloadTemplate = () => {
    const blob = new Blob([TEMPLATE], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "buy-lots-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const commit = () => {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("clientId", clientId);
      fd.set("rows", JSON.stringify(validRows));
      const res = await importBuyLotsAction(fd);
      setResult(`Imported ${res.imported} buy lot${res.imported === 1 ? "" : "s"}.`);
      setRows(null);
      setFileName("");
      router.refresh();
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem", maxWidth: 900 }}>
      <div className="glass" style={{ padding: "1.5rem" }}>
        <h2 style={{ fontSize: "1rem", fontWeight: 600, color: "#a78bfa", marginBottom: "0.75rem" }}>1. CSV Format</h2>
        <p style={{ fontSize: "0.85rem", color: "#9ca3af", marginBottom: "0.75rem" }}>
          Columns: <code style={{ color: "#e6e7ee" }}>symbol, exchange, quantity, pricePerShare, tradeDate, notes</code>.
          Exchange is <code>NSE</code> or <code>BSE</code>. Date as <code>YYYY-MM-DD</code>. Notes optional. A header row is fine — it will be skipped.
        </p>
        <button type="button" onClick={downloadTemplate} className="btn btn-ghost" style={{ fontSize: "0.8rem" }}>
          ⬇ Download template
        </button>
      </div>

      <div className="glass" style={{ padding: "1.5rem" }}>
        <h2 style={{ fontSize: "1rem", fontWeight: 600, color: "#a78bfa", marginBottom: "0.75rem" }}>2. Upload CSV</h2>
        <input
          type="file"
          accept=".csv,text/csv"
          className="input"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
          }}
        />
        {fileName && <div style={{ fontSize: "0.8rem", color: "#9ca3af", marginTop: "0.5rem" }}>Loaded: {fileName}</div>}
      </div>

      {rows && (
        <div className="glass" style={{ padding: "1.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem", flexWrap: "wrap", gap: "0.5rem" }}>
            <h2 style={{ fontSize: "1rem", fontWeight: 600, color: "#a78bfa" }}>
              3. Preview — {validRows.length} valid{invalidCount > 0 ? `, ${invalidCount} with errors` : ""}
            </h2>
            <button
              type="button"
              onClick={commit}
              disabled={pending || validRows.length === 0}
              className="btn btn-primary"
              style={{ opacity: pending || validRows.length === 0 ? 0.6 : 1 }}
            >
              {pending ? "Importing…" : `Import ${validRows.length} lot${validRows.length === 1 ? "" : "s"}`}
            </button>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table className="data">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Symbol</th>
                  <th>Exchange</th>
                  <th style={{ textAlign: "right" }}>Qty</th>
                  <th style={{ textAlign: "right" }}>Price</th>
                  <th>Date</th>
                  <th>Notes</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.rowNum} style={{ opacity: r.errors.length ? 0.6 : 1 }}>
                    <td style={{ color: "#6b7280" }}>{r.rowNum}</td>
                    <td style={{ fontWeight: 600 }}>{r.symbol || "—"}</td>
                    <td>{r.exchange}</td>
                    <td style={{ textAlign: "right" }}>{r.quantity}</td>
                    <td style={{ textAlign: "right" }}>{r.pricePerShare}</td>
                    <td>{r.tradeDate}</td>
                    <td style={{ color: "#9ca3af", fontSize: "0.8rem" }}>{r.notes || "—"}</td>
                    <td style={{ fontSize: "0.75rem" }}>
                      {r.errors.length === 0 ? (
                        <span className="pos">✓ ok</span>
                      ) : (
                        <span className="neg">{r.errors.join("; ")}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {result && (
        <div className="glass" style={{ padding: "1rem 1.5rem", color: "#86efac", fontSize: "0.9rem" }}>
          {result} <a href={`/clients/${clientId}`} style={{ color: "#a78bfa", textDecoration: "underline" }}>View client →</a>
        </div>
      )}
    </div>
  );
}
