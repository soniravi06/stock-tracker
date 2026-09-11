import { requireSession } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/AppShell";
import { SettingsForms } from "@/components/SettingsForms";

export default async function SettingsPage() {
  const session = await requireSession();

  let currentPhone = "";
  if (session.user.role === "client" && session.user.linkedClientId) {
    const c = await prisma.client.findUnique({
      where: { id: session.user.linkedClientId },
      select: { phone: true },
    });
    currentPhone = c?.phone ?? "";
  } else {
    const u = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { phone: true },
    });
    currentPhone = u?.phone ?? "";
  }

  return (
    <AppShell role={session.user.role} userName={session.user.name || session.user.email} currentPath="/settings">
      <div style={{ marginBottom: "2rem" }}>
        <div style={{ fontSize: "0.75rem", color: "#7c5cff", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "0.5rem" }}>
          Account
        </div>
        <h1 style={{ fontSize: "2rem", fontWeight: 700, letterSpacing: "-0.02em" }}>Settings</h1>
        <p style={{ color: "#9ca3af", marginTop: "0.5rem" }}>
          {session.user.email} · {session.user.role}
        </p>
      </div>

      <SettingsForms currentPhone={currentPhone} />
    </AppShell>
  );
}
