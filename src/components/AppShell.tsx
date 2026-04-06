import Link from "next/link";
import { signOut } from "@/lib/auth";
import type { Role } from "@prisma/client";

async function logoutAction() {
  "use server";
  await signOut({ redirectTo: "/login" });
}

type NavItem = { href: string; label: string };

export function AppShell({
  children,
  role,
  userName,
  currentPath,
}: {
  children: React.ReactNode;
  role: Role;
  userName: string;
  currentPath?: string;
}) {
  const nav: NavItem[] =
    role === "superadmin"
      ? [
          { href: "/dashboard", label: "Overview" },
          { href: "/admins", label: "Admins" },
          { href: "/clients", label: "All Clients" },
          { href: "/audit", label: "Audit Log" },
        ]
      : role === "admin"
      ? [
          { href: "/dashboard", label: "Dashboard" },
          { href: "/clients", label: "Clients" },
          { href: "/audit", label: "Audit Log" },
        ]
      : [
          { href: "/my", label: "My Portfolio" },
        ];

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <aside
        style={{
          width: 240,
          borderRight: "1px solid rgba(255,255,255,0.06)",
          padding: "1.5rem 1rem",
          background: "rgba(10, 11, 20, 0.4)",
          backdropFilter: "blur(12px)",
          position: "sticky",
          top: 0,
          height: "100vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ marginBottom: "2rem", padding: "0 0.5rem" }}>
          <div
            style={{
              fontSize: "0.7rem",
              color: "#7c5cff",
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              fontWeight: 700,
            }}
          >
            Portfolio
          </div>
          <div style={{ fontSize: "1.1rem", fontWeight: 700, marginTop: "0.15rem" }}>
            Tracker
          </div>
        </div>

        <nav style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
          {nav.map((n) => {
            const active = currentPath === n.href;
            return (
              <Link
                key={n.href}
                href={n.href}
                style={{
                  padding: "0.6rem 0.85rem",
                  borderRadius: 8,
                  fontSize: "0.875rem",
                  color: active ? "#fff" : "#9ca3af",
                  background: active ? "rgba(124, 92, 255, 0.15)" : "transparent",
                  border: active ? "1px solid rgba(124, 92, 255, 0.3)" : "1px solid transparent",
                  textDecoration: "none",
                  fontWeight: active ? 600 : 500,
                }}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>

        <div style={{ marginTop: "auto", paddingTop: "1rem", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ padding: "0.5rem 0.85rem", marginBottom: "0.5rem" }}>
            <div style={{ fontSize: "0.8rem", fontWeight: 600 }}>{userName}</div>
            <div style={{ fontSize: "0.7rem", color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              {role}
            </div>
          </div>
          <form action={logoutAction}>
            <button type="submit" className="btn btn-ghost" style={{ width: "100%", justifyContent: "center" }}>
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <main style={{ flex: 1, padding: "2rem 2.5rem", maxWidth: "100%", overflow: "auto" }}>
        {children}
      </main>
    </div>
  );
}
