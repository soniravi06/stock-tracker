import { requireSession, getAuthorizedClient } from "@/lib/access";
import { AppShell } from "@/components/AppShell";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { CsvImport } from "@/components/CsvImport";

export default async function ImportBuyLotsPage({
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
        <h1 style={{ fontSize: "2rem", fontWeight: 700, letterSpacing: "-0.02em", marginTop: "0.75rem" }}>
          Import Buy Lots
        </h1>
        <p style={{ color: "#9ca3af", marginTop: "0.5rem" }}>
          Bulk-load buy transactions for <strong>{client.name}</strong> from a CSV file.
        </p>
      </div>

      <CsvImport clientId={id} />
    </AppShell>
  );
}
