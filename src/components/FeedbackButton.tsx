"use client";

import { useState } from "react";
import { submitFeedbackAction } from "@/lib/actions";
import type { Role } from "@prisma/client";

const PAGES: Record<Role, { href: string; label: string }[]> = {
  superadmin: [
    { href: "/dashboard", label: "Overview" },
    { href: "/admins", label: "Admins" },
    { href: "/clients", label: "All Clients" },
    { href: "/transactions", label: "Transactions" },
    { href: "/payments", label: "Payments" },
    { href: "/reports/commission", label: "Commission" },
    { href: "/audit", label: "Audit Log" },
    { href: "/settings", label: "Settings" },
  ],
  admin: [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/clients", label: "Clients" },
    { href: "/transactions", label: "Transactions" },
    { href: "/payments", label: "Payments" },
    { href: "/reports/commission", label: "Commission" },
    { href: "/settings", label: "Settings" },
  ],
  client: [
    { href: "/my", label: "My Portfolio" },
    { href: "/settings", label: "Settings" },
  ],
};

export function FeedbackButton({ role }: { role: Role }) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(PAGES[role][0].href);
  const [message, setMessage] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState("sending");
    try {
      const fd = new FormData();
      fd.set("page", page);
      fd.set("message", message);
      await submitFeedbackAction(fd);
      setState("sent");
      setMessage("");
      setTimeout(() => { setOpen(false); setState("idle"); }, 1200);
    } catch {
      setState("error");
    }
  };

  return (
    <>
      <button type="button" className="btn btn-ghost" style={{ width: "100%", justifyContent: "center" }} onClick={() => setOpen(true)}>
        Feedback
      </button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem", backdropFilter: "blur(4px)" }}
        >
          <div onClick={(e) => e.stopPropagation()} className="glass" style={{ width: "100%", maxWidth: 440, padding: "1.75rem" }}>
            <h2 style={{ fontSize: "1.15rem", fontWeight: 700, marginBottom: "1rem" }}>Share Feedback</h2>
            <form onSubmit={submit}>
              <div style={{ marginBottom: "0.75rem" }}>
                <label className="label">Page</label>
                <select className="select" value={page} onChange={(e) => setPage(e.target.value)}>
                  {PAGES[role].map((p) => (
                    <option key={p.href} value={p.href}>{p.label}</option>
                  ))}
                </select>
              </div>
              <div style={{ marginBottom: "1rem" }}>
                <label className="label">Feedback</label>
                <textarea
                  className="input"
                  rows={4}
                  required
                  minLength={3}
                  placeholder="What's working, what's not?"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  style={{ resize: "vertical" }}
                />
              </div>
              {state === "error" && (
                <div style={{ color: "#fca5a5", fontSize: "0.8rem", marginBottom: "0.75rem" }}>Failed to send. Please try again.</div>
              )}
              <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={state === "sending" || state === "sent"}>
                  {state === "sending" ? "Sending…" : state === "sent" ? "Sent ✓" : "Submit"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
