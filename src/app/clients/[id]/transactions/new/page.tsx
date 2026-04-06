import { requireSession, getAuthorizedClient } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/AppShell";
import { writeAudit } from "@/lib/audit";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";

async function createTxAction(formData: FormData) {
  "use server";
  const session = await requireSession();
  if (session.user.role === "client") redirect("/my");

  const clientId = String(formData.get("clientId"));
  const client = await getAuthorizedClient(clientId);
  if (!client) return;

  const symbol = String(formData.get("symbol") || "").trim().toUpperCase();
  const exchange = String(formData.get("exchange") || "NSE") as "NSE" | "BSE";
  const type = String(formData.get("type") || "buy") as "buy" | "sell";
  const quantity = parseFloat(String(formData.get("quantity") || "0"));
  const pricePerShare = parseFloat(String(formData.get("pricePerShare") || "0"));
  const tradeDate = new Date(String(formData.get("tradeDate")));
  const overrideCommission = String(formData.get("overrideCommission") || "");
  const customCommission = parseFloat(String(formData.get("customCommission") || "0"));
  const notes = String(formData.get("notes") || "").trim() || null;

  if (!symbol || quantity <= 0 || pricePerShare <= 0) return;

  let commissionAmount = 0;
  if (overrideCommission === "on" && !isNaN(customCommission)) {
    commissionAmount = customCommission;
  } else {
    // Apply client default
    if (client.defaultCommissionType === "percentage") {
      commissionAmount = (quantity * pricePerShare * client.defaultCommissionValue) / 100;
    } else {
      commissionAmount = client.defaultCommissionValue;
    }
  }

  const tx = await prisma.transaction.create({
    data: {
      clientId,
      symbol,
      exchange,
      type,
      quantity,
      pricePerShare,
      tradeDate,
      commissionAmount,
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

export default async function NewTransactionPage({
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
      <h1 style={{ fontSize: "2rem", fontWeight: 700, margin: "0.75rem 0 2rem", letterSpacing: "-0.02em" }}>New Transaction</h1>

      <form action={createTxAction} className="glass" style={{ padding: "2rem", maxWidth: 720, display: "flex", flexDirection: "column", gap: "1.25rem" }}>
        <input type="hidden" name="clientId" value={id} />

        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: "1rem" }}>
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
          <div>
            <label className="label">Type</label>
            <select className="select" name="type" defaultValue="buy">
              <option value="buy">Buy</option>
              <option value="sell">Sell</option>
            </select>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem" }}>
          <div>
            <label className="label">Quantity *</label>
            <input className="input" type="number" step="0.0001" name="quantity" required />
          </div>
          <div>
            <label className="label">Price / Share *</label>
            <input className="input" type="number" step="0.01" name="pricePerShare" required />
          </div>
          <div>
            <label className="label">Trade Date *</label>
            <input className="input" type="date" name="tradeDate" required defaultValue={today} />
          </div>
        </div>

        <div style={{ padding: "1rem", background: "rgba(124, 92, 255, 0.06)", borderRadius: 10, border: "1px solid rgba(124, 92, 255, 0.15)" }}>
          <div style={{ fontSize: "0.8rem", color: "#a78bfa", marginBottom: "0.75rem" }}>
            Default commission for this client:&nbsp;
            <strong>
              {client.defaultCommissionType === "percentage"
                ? `${client.defaultCommissionValue}% of trade value`
                : `₹${client.defaultCommissionValue} flat`}
            </strong>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.875rem", cursor: "pointer" }}>
            <input type="checkbox" name="overrideCommission" />
            Override commission for this transaction
          </label>
          <input className="input" type="number" step="0.01" name="customCommission" placeholder="Custom commission in ₹" style={{ marginTop: "0.75rem" }} />
        </div>

        <div>
          <label className="label">Notes</label>
          <input className="input" name="notes" placeholder="Optional..." />
        </div>

        <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.5rem" }}>
          <button type="submit" className="btn btn-primary">Save Transaction</button>
          <Link href={`/clients/${id}`} className="btn btn-ghost">Cancel</Link>
        </div>
      </form>
    </AppShell>
  );
}
