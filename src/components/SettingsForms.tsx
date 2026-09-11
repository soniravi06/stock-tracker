"use client";

import { useState } from "react";
import { changePasswordAction, updatePhoneAction } from "@/lib/actions";

type Status = { kind: "idle" | "saving" | "ok" | "error"; msg?: string };

export function SettingsForms({ currentPhone }: { currentPhone: string }) {
  const [pwStatus, setPwStatus] = useState<Status>({ kind: "idle" });
  const [phoneStatus, setPhoneStatus] = useState<Status>({ kind: "idle" });
  const [phone, setPhone] = useState(currentPhone);

  const submitPassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    if (fd.get("newPassword") !== fd.get("confirmPassword")) {
      setPwStatus({ kind: "error", msg: "New passwords do not match" });
      return;
    }
    setPwStatus({ kind: "saving" });
    try {
      await changePasswordAction(fd);
      setPwStatus({ kind: "ok", msg: "Password updated" });
      form.reset();
    } catch (err: any) {
      setPwStatus({ kind: "error", msg: err?.message || "Failed to update password" });
    }
  };

  const submitPhone = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPhoneStatus({ kind: "saving" });
    try {
      const fd = new FormData();
      fd.set("phone", phone);
      await updatePhoneAction(fd);
      setPhoneStatus({ kind: "ok", msg: "Phone updated" });
    } catch (err: any) {
      setPhoneStatus({ kind: "error", msg: err?.message || "Failed to update phone" });
    }
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "1.25rem", maxWidth: 900 }}>
      <div className="glass" style={{ padding: "1.5rem" }}>
        <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1rem" }}>Change Password</h2>
        <form onSubmit={submitPassword}>
          <div style={{ marginBottom: "0.75rem" }}>
            <label className="label">Current Password</label>
            <input className="input" type="password" name="currentPassword" required autoComplete="current-password" />
          </div>
          <div style={{ marginBottom: "0.75rem" }}>
            <label className="label">New Password</label>
            <input className="input" type="password" name="newPassword" required minLength={8} autoComplete="new-password" />
          </div>
          <div style={{ marginBottom: "1rem" }}>
            <label className="label">Confirm New Password</label>
            <input className="input" type="password" name="confirmPassword" required minLength={8} autoComplete="new-password" />
          </div>
          <StatusLine status={pwStatus} />
          <button type="submit" className="btn btn-primary" disabled={pwStatus.kind === "saving"} style={{ marginTop: "0.75rem" }}>
            {pwStatus.kind === "saving" ? "Updating…" : "Update Password"}
          </button>
        </form>
      </div>

      <div className="glass" style={{ padding: "1.5rem" }}>
        <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1rem" }}>Phone Number</h2>
        <form onSubmit={submitPhone}>
          <div style={{ marginBottom: "1rem" }}>
            <label className="label">Phone</label>
            <input className="input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" />
          </div>
          <StatusLine status={phoneStatus} />
          <button type="submit" className="btn btn-primary" disabled={phoneStatus.kind === "saving"} style={{ marginTop: "0.75rem" }}>
            {phoneStatus.kind === "saving" ? "Saving…" : "Save Phone"}
          </button>
        </form>
      </div>
    </div>
  );
}

function StatusLine({ status }: { status: Status }) {
  if (status.kind === "idle" || status.kind === "saving") return null;
  return (
    <div style={{ fontSize: "0.8rem", color: status.kind === "ok" ? "#86efac" : "#fca5a5" }}>
      {status.msg}
    </div>
  );
}
