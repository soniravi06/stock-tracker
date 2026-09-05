export function StatSkeleton() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem", marginBottom: "2rem" }}>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="glass stat-card">
          <div className="skeleton" style={{ height: 12, width: "50%", marginBottom: "0.75rem" }} />
          <div className="skeleton" style={{ height: 28, width: "70%" }} />
        </div>
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="glass" style={{ padding: "1rem" }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton" style={{ height: 40, marginBottom: i === rows - 1 ? 0 : "0.5rem" }} />
      ))}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div style={{ padding: "2rem 2.5rem" }}>
      <div className="skeleton" style={{ height: 14, width: 120, marginBottom: "0.75rem" }} />
      <div className="skeleton" style={{ height: 32, width: 280, marginBottom: "2rem" }} />
      <StatSkeleton />
      <TableSkeleton />
    </div>
  );
}
