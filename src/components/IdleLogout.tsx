"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const IDLE_MS = 10 * 60 * 1000;
const EVENTS = ["mousemove", "mousedown", "keydown", "scroll", "touchstart"] as const;

/**
 * Client-side idle timeout: after 10 minutes without user interaction,
 * redirect to /login. The server-side JWT idle check in auth.config.ts
 * is the real enforcement; this just makes the UX immediate.
 */
export function IdleLogout() {
  const router = useRouter();

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        router.push("/login?reason=idle");
        router.refresh();
      }, IDLE_MS);
    };

    EVENTS.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();

    return () => {
      clearTimeout(timer);
      EVENTS.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [router]);

  return null;
}
