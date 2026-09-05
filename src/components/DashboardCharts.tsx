"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

export type ClientValuePoint = {
  name: string;
  value: number;
};

export type PnlSplit = {
  name: string;
  value: number;
};

export type HoldingPoint = {
  symbol: string;
  value: number;
};

const COLORS = ["#7c5cff", "#22c55e", "#f59e0b", "#3b82f6", "#ec4899", "#a78bfa"];

function inrCompact(n: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
}

function inr(n: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

const tooltipStyle: React.CSSProperties = {
  background: "rgba(18,20,31,0.95)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 8,
  fontSize: "0.8rem",
};

export function DashboardCharts({
  clientValues,
  pnlSplit,
  topHoldings,
}: {
  clientValues: ClientValuePoint[];
  pnlSplit: PnlSplit[];
  topHoldings: HoldingPoint[];
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "1.5rem", marginBottom: "2rem" }}>
      {/* Portfolio value per client */}
      <ChartCard title="Portfolio Value by Client">
        {clientValues.length === 0 ? (
          <Empty />
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={clientValues} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="name" tick={{ fill: "#9ca3af", fontSize: 11 }} />
              <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} tickFormatter={inrCompact} width={70} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => inr(v)} />
              <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                {clientValues.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* Realized vs Unrealized donut */}
      <ChartCard title="Realized vs Unrealized P&L">
        {pnlSplit.every((p) => p.value === 0) ? (
          <Empty />
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={pnlSplit}
                dataKey="value"
                nameKey="name"
                innerRadius={55}
                outerRadius={85}
                paddingAngle={3}
              >
                {pnlSplit.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => inr(v)} />
              <Legend wrapperStyle={{ fontSize: "0.8rem", color: "#9ca3af" }} />
            </PieChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* Top 5 holdings */}
      <ChartCard title="Top 5 Holdings by Value">
        {topHoldings.length === 0 ? (
          <Empty />
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={topHoldings} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis type="number" tick={{ fill: "#9ca3af", fontSize: 11 }} tickFormatter={inrCompact} />
              <YAxis type="category" dataKey="symbol" tick={{ fill: "#9ca3af", fontSize: 11 }} width={80} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => inr(v)} />
              <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                {topHoldings.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="glass" style={{ padding: "1.25rem 1.5rem" }}>
      <div style={{ fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.75rem", color: "#a78bfa", textTransform: "uppercase", letterSpacing: "0.08em" }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function Empty() {
  return (
    <div style={{ height: 260, display: "flex", alignItems: "center", justifyContent: "center", color: "#6b7280", fontSize: "0.85rem" }}>
      No data yet
    </div>
  );
}
