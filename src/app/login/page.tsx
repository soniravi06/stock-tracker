import { signIn } from "@/lib/auth";
import { redirect } from "next/navigation";

async function loginAction(formData: FormData) {
  "use server";
  const email = String(formData.get("email") || "");
  const password = String(formData.get("password") || "");
  try {
    await signIn("credentials", { email, password, redirect: false });
  } catch {
    redirect("/login?error=1");
  }
  redirect("/");
}

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem" }}>
      <div className="glass" style={{ width: "100%", maxWidth: 420, padding: "2.5rem" }}>
        <div style={{ marginBottom: "2rem" }}>
          <div style={{ fontSize: "0.75rem", color: "#7c5cff", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "0.5rem" }}>
            Portfolio Tracker
          </div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 700, letterSpacing: "-0.02em" }}>Sign in</h1>
          <p style={{ color: "#9ca3af", fontSize: "0.875rem", marginTop: "0.5rem" }}>
            Track holdings, gains & payments for your clients.
          </p>
        </div>

        <form action={loginAction} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div>
            <label className="label">Email</label>
            <input className="input" type="email" name="email" required placeholder="you@example.com" />
          </div>
          <div>
            <label className="label">Password</label>
            <input className="input" type="password" name="password" required placeholder="••••••••" />
          </div>
          <button type="submit" className="btn btn-primary" style={{ width: "100%", justifyContent: "center", marginTop: "0.5rem" }}>
            Sign in
          </button>
        </form>

        {/*<div style={{ marginTop: "2rem", padding: "1rem", background: "rgba(124, 92, 255, 0.08)", borderRadius: 10, border: "1px solid rgba(124, 92, 255, 0.2)" }}>
          <div style={{ fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "#a78bfa", marginBottom: "0.5rem", fontWeight: 600 }}>
            Demo credentials
          </div>
          <div style={{ fontSize: "0.75rem", color: "#d1d5db", lineHeight: 1.8, fontFamily: "monospace" }}>
            <div>Superadmin: admin@example.com / ChangeMe123!</div>
            <div>Admin: rajesh@firm.com / Admin123!</div>
            <div>Client: amit@example.com / Client123!</div>
          </div>
</div> */}
      </div>
    </div>
  );
}
