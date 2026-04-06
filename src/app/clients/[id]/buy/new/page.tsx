import { requireSession, getAuthorizedClient } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/AppShell";
import { writeAudit } from "@/lib/audit";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";

async function createBuyAction(formData: FormData) {
  "use server";
  const session = await requireSession();
  if (session.user.role === "client") redirect("/my");

  const clientId = String(formData.get("clientId"));
  const client = await getAuthorizedClient(clientId);
  if (!client) return;

  const symbol = String(formData.get("symbol") || "").trim().toUpperCase();
  const exchange = String(formData.get("exchange") || "NSE") as "NSE" | "BSE";
  const quantity = parseFloat(String(formData.get("quantity") || "0"));
  const pricePerShare = parseFloat(String(formData.get("pricePerShare") || "0"));
  const tradeDate = new Date(String(formData.get("tradeDate")));
  const notes = String(formData.get("notes") || "").trim() || null;

  if (!symbol || quantity <= 0 || pricePerShare <= 0) return;

  const tx = await prisma.transaction.create({
    data: {
      clientId,
      symbol,
      exchange,
      quantity,
      remainingQty: quantity,
      pricePerShare,
      tradeDate,
      notes,
      createdByUserId: session.user.id,
    },
  });

  await writeAudit({
    actorUserId: session.user.id,
    actorRole: session.user.role,
    onBehalfOfAdminId: session.user.role === "superadmin" ? client.adminId : null,
    action: "create",
    entityType: "Transaction",
    entityId: tx.id,
    after: tx,
  });

  redirect(`/clients/${clientId}`);
}

export default async function NewBuyPage({
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
      <h1 style={{ fontSize: "2rem", fontWeight: 700, margin: "0.75rem 0 0.5rem", letterSpacing: "-0.02em" }}>New Buy</h1>
      <p style={{ color: "#9ca3af", marginBottom: "2rem", fontSize: "0.875rem" }}>
        Records a new buy lot. Sell it later from the Holdings section to close the trade.
      </p>

      <form action={createBuyAction} className="glass" style={{ padding: "2rem", maxWidth: 720, display: "flex", flexDirection: "column", gap: "1.25rem" }}>
        <input type="hidden" name="clientId" value={id} />

        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "1rem" }}>
          <div>
            <label className="label">Symbol *</label>
            <input className="input" name="symbol" required placeholder="RELIANCE" />
          </div>
          <div>
            <label className="label">Exchange</label>
            <select className="select" name="exchange" defaultValue="NSE">
              <option value="NSE">NSE</option>
              <option value="BSE">BSE</option>
            </select>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem" }}>
          <div>
            <label className="label">Quantity *</label>
            <input className="input" type="number" step="any" name="quantity" required />
          </div>
          <div>
            <label className="label">Price / Share *</label>
            <input className="input" type="number" step="0.01" name="pricePerShare" required />
          </div>
          <div>
            <label className="label">Buy Date *</label>
            <input className="input" type="date" name="tradeDate" required defaultValue={today} />
          </div>
        </div>

        <div>
          <label className="label">Notes</label>
          <input className="input" name="notes" placeholder="Optional..." />
        </div>

        <div style={{ padding: "0.85rem", background: "rgba(124, 92, 255, 0.06)", borderRadius: 10, border: "1px solid rgba(124, 92, 255, 0.15)", fontSize: "0.8rem", color: "#a78bfa" }}>
          💡 Commission is set at sell time, not buy time. You'll enter it when you close the trade.
        </div>

        <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.5rem" }}>
          <button type="submit" className="btn btn-primary">Save Buy</button>
          <Link href={`/clients/${id}`} className="btn btn-ghost">Cancel</Link>
        </div>
      </form>
    </AppShell>
  );
}
