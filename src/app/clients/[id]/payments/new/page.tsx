import { requireSession, getAuthorizedClient } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/AppShell";
import { writeAudit } from "@/lib/audit";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";

async function createPaymentAction(formData: FormData) {
  "use server";
  const session = await requireSession();
  if (session.user.role === "client") redirect("/my");

  const clientId = String(formData.get("clientId"));
  const client = await getAuthorizedClient(clientId);
  if (!client) return;

  const amount = parseFloat(String(formData.get("amount") || "0"));
  const direction = String(formData.get("direction") || "in") as "in" | "out";
  const status = String(formData.get("status") || "pending") as "pending" | "received";
  const date = new Date(String(formData.get("date")));
  const notes = String(formData.get("notes") || "").trim() || null;

  if (amount <= 0) return;

  const p = await prisma.payment.create({
    data: {
      clientId,
      amount,
      direction,
      status,
      date,
      notes,
      createdByUserId: session.user.id,
    },
  });

  await writeAudit({
    actorUserId: session.user.id,
    actorRole: session.user.role,
    onBehalfOfAdminId: session.user.role === "superadmin" ? client.adminId : null,
    action: "create",
    entityType: "Payment",
    entityId: p.id,
    after: p,
  });

  redirect(`/clients/${clientId}`);
}

export default async function NewPaymentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  if (session.user.role === "client") redirect("/my");
  const { id } = await params;
  const client = await getAuthorizedClient(id);
  if (!client) notFound();

  const today = new Date().toISOString().slice(0, 10);

  return (
    <AppShell role={session.user.role} userName={session.user.name || session.user.email} currentPath="/clients">
      <Link href={`/clients/${id}`} style={{ fontSize: "0.8rem", color: "#9ca3af" }}>← {client.name}</Link>
      <h1 style={{ fontSize: "2rem", fontWeight: 700, margin: "0.75rem 0 2rem", letterSpacing: "-0.02em" }}>New Payment</h1>

      <form action={createPaymentAction} className="glass" style={{ padding: "2rem", maxWidth: 640, display: "flex", flexDirection: "column", gap: "1.25rem" }}>
        <input type="hidden" name="clientId" value={id} />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
          <div>
            <label className="label">Amount (₹) *</label>
            <input className="input" type="number" step="0.01" name="amount" required />
          </div>
          <div>
            <label className="label">Date *</label>
            <input className="input" type="date" name="date" required defaultValue={today} />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
          <div>
            <label className="label">Direction</label>
            <select className="select" name="direction" defaultValue="in">
              <option value="in">Deposit (money in)</option>
              <option value="out">Withdrawal (money out)</option>
            </select>
          </div>
          <div>
            <label className="label">Status</label>
            <select className="select" name="status" defaultValue="pending">
              <option value="pending">Pending</option>
              <option value="received">Received</option>
            </select>
          </div>
        </div>

        <div>
          <label className="label">Notes</label>
          <input className="input" name="notes" placeholder="Optional..." />
        </div>

        <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.5rem" }}>
          <button type="submit" className="btn btn-primary">Save Payment</button>
          <Link href={`/clients/${id}`} className="btn btn-ghost">Cancel</Link>
        </div>
      </form>
    </AppShell>
  );
}
