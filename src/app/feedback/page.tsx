export const dynamic = "force-dynamic";

import { requireSession } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/AppShell";
import { fmtDateTime } from "@/lib/format";
import { redirect } from "next/navigation";

const PAGE_LABELS: Record<string, string> = {
  "/dashboard": "Dashboard / Overview",
  "/admins": "Admins",
  "/clients": "Clients",
  "/transactions": "Transactions",
  "/payments": "Payments",
  "/reports/commission": "Commission Report",
  "/audit": "Audit Log",
  "/my": "My Portfolio",
  "/settings": "Settings",
};

export default async function FeedbackPage() {
  const session = await requireSession();
  if (session.user.role !== "superadmin") {
    redirect(session.user.role === "client" ? "/my" : "/dashboard");
  }

  const feedback = await prisma.feedback.findMany({
    orderBy: { createdAt: "desc" },
    take: 500,
    include: { user: { select: { name: true, email: true } } },
  });

  return (
    <AppShell role={session.user.role} userName={session.user.name || session.user.email} currentPath="/feedback">
      <div style={{ marginBottom: "2rem" }}>
        <div style={{ fontSize: "0.75rem", color: "#7c5cff", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "0.5rem" }}>
          Superadmin
        </div>
        <h1 style={{ fontSize: "2rem", fontWeight: 700, letterSpacing: "-0.02em" }}>User Feedback</h1>
        <p style={{ color: "#9ca3af", marginTop: "0.5rem" }}>
          {feedback.length} submission{feedback.length === 1 ? "" : "s"} from all users.
        </p>
      </div>

      <div className="glass" style={{ overflow: "hidden" }}>
        <table className="data">
          <thead>
            <tr>
              <th>Received</th>
              <th>User</th>
              <th>Role</th>
              <th>Page</th>
              <th>Feedback</th>
            </tr>
          </thead>
          <tbody>
            {feedback.length === 0 && (
              <tr><td colSpan={5} style={{ textAlign: "center", color: "#9ca3af", padding: "2rem" }}>No feedback yet.</td></tr>
            )}
            {feedback.map((f) => (
              <tr key={f.id}>
                <td style={{ color: "#9ca3af", fontSize: "0.8rem", whiteSpace: "nowrap" }}>
                  {fmtDateTime(f.createdAt)} IST
                </td>
                <td>
                  <div style={{ fontWeight: 600 }}>{f.user.name || "—"}</div>
                  <div style={{ fontSize: "0.75rem", color: "#9ca3af" }}>{f.user.email}</div>
                </td>
                <td>
                  <span className="badge" style={{ background: "rgba(124,92,255,0.15)", color: "#a78bfa" }}>
                    {f.role}
                  </span>
                </td>
                <td style={{ fontSize: "0.85rem" }}>{PAGE_LABELS[f.page] || f.page}</td>
                <td style={{ fontSize: "0.85rem", color: "#d1d5db", maxWidth: 420, whiteSpace: "pre-wrap" }}>{f.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
