import { requireSession, getAuthorizedClient } from "@/lib/access";
import { AppShell } from "@/components/AppShell";
import { updateClientAction } from "@/lib/actions";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";

export default async function EditClientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  if (session.user.role === "client") redirect("/my");

  const { id } = await params;
  const client = await getAuthorizedClient(id);
  if (!client) notFound();

  return (
    <AppShell role={session.user.role} userName={session.user.name || session.user.email} currentPath="/clients">
      <div style={{ marginBottom: "2rem" }}>
        <Link href={`/clients/${id}`} style={{ fontSize: "0.8rem", color: "#9ca3af" }}>← Back to {client.name}</Link>
        <h1 style={{ fontSize: "2rem", fontWeight: 700, letterSpacing: "-0.02em", marginTop: "0.75rem" }}>Edit Client</h1>
        <p style={{ color: "#9ca3af", marginTop: "0.5rem" }}>
          Update client details and their default commission. The default pre-fills the sell form for new trades.
        </p>
      </div>

      <form action={updateClientAction} className="glass" style={{ padding: "2rem", maxWidth: 720, display: "flex", flexDirection: "column", gap: "1.25rem" }}>
        <input type="hidden" name="clientId" value={client.id} />

        <h2 style={{ fontSize: "1rem", fontWeight: 600, color: "#a78bfa" }}>Client Details</h2>

        <div>
          <label className="label">Name *</label>
          <input className="input" name="name" required defaultValue={client.name} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
          <div>
            <label className="label">Email</label>
            <input className="input" type="email" name="email" defaultValue={client.email || ""} />
          </div>
          <div>
            <label className="label">Phone</label>
            <input className="input" name="phone" defaultValue={client.phone || ""} />
          </div>
        </div>

        <h2 style={{ fontSize: "1rem", fontWeight: 600, color: "#a78bfa", marginTop: "0.5rem" }}>Default Commission</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
          <div>
            <label className="label">Type</label>
            <select className="select" name="defaultCommissionType" defaultValue={client.defaultCommissionType}>
              <option value="percentage">Percentage (%)</option>
              <option value="flat">Flat (₹)</option>
            </select>
          </div>
          <div>
            <label className="label">Value</label>
            <input className="input" type="number" name="defaultCommissionValue" step="0.01" defaultValue={client.defaultCommissionValue} />
          </div>
        </div>
        <p style={{ fontSize: "0.75rem", color: "#9ca3af", marginTop: "-0.5rem" }}>
          Percentage is applied to the gross P&amp;L of each completed trade (signed — negative on losses). Flat is a fixed ₹ amount per trade.
        </p>

        <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end", marginTop: "0.5rem" }}>
          <Link href={`/clients/${id}`} className="btn btn-ghost">Cancel</Link>
          <button type="submit" className="btn btn-primary">Save Changes</button>
        </div>
      </form>
    </AppShell>
  );
}
