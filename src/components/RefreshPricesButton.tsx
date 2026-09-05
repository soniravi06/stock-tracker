"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { refreshPricesAction } from "@/lib/actions";

export function RefreshPricesButton({ clientId }: { clientId?: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const onClick = () => {
    startTransition(async () => {
      const fd = new FormData();
      if (clientId) fd.set("clientId", clientId);
      await refreshPricesAction(fd);
      router.refresh();
    });
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="btn btn-ghost"
      style={{ fontSize: "0.8rem", display: "inline-flex", alignItems: "center", gap: "0.5rem", opacity: pending ? 0.7 : 1 }}
      title="Re-fetch live prices from Yahoo Finance"
    >
      <span
        style={{
          display: "inline-block",
          width: 14,
          height: 14,
          border: "2px solid rgba(255,255,255,0.25)",
          borderTopColor: "#7c5cff",
          borderRadius: "50%",
          animation: pending ? "spin 0.8s linear infinite" : "none",
        }}
      />
      {pending ? "Refreshing…" : "Refresh prices"}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </button>
  );
}
