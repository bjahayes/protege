"use client";

import { apiFetch } from "@/lib/api-client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Job } from "@/lib/types";

const NOTIFY_STATES = new Set(["done", "error", "idle"]);
const LS_KEY = "protege_notify_enabled";

export default function NotificationCenter() {
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [enabled, setEnabled] = useState(false);

  const prevStatus = useRef<Map<string, string>>(new Map());
  const notified = useRef<Set<string>>(new Set());
  const seeded = useRef(false);

  // Register SW + read initial permission/preference.
  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    setSupported(true);
    setPermission(Notification.permission);
    setEnabled(localStorage.getItem(LS_KEY) === "1");
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  const fire = useCallback(async (job: Job) => {
    const isolated = job.worktreeState && job.worktreeState !== "none" && job.worktreeState === "active";
    let title = "";
    if ((job.status as string) === "stuck") title = `⚠ Agent may be stuck — ${job.projectName}`;
    else if (job.status === "done") title = isolated ? `✓ Ready to review — ${job.projectName}` : `✓ Agent finished — ${job.projectName}`;
    else if (job.status === "error") title = `✗ Agent failed — ${job.projectName}`;
    else if (job.status === "idle") title = `🖐 Agent needs you — ${job.projectName}`;
    else return;

    const body = (job.prompt || "").slice(0, 140);
    const url = `/agents?job=${job.id}`;
    const options: NotificationOptions = {
      body,
      tag: `${job.id}:${job.status}`,
      data: { url },
    };
    try {
      const reg = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : null;
      if (reg) await reg.showNotification(title, options);
      else new Notification(title, options);
    } catch {
      try {
        new Notification(title, options);
      } catch {
        /* ignore */
      }
    }
  }, []);

  // Poll job states and notify on transitions.
  useEffect(() => {
    if (!enabled || permission !== "granted") return;

    const poll = async () => {
      try {
        const r = await apiFetch("/api/jobs", { cache: "no-store" });
        const j = await r.json();
        const jobs: Job[] = [...(j.live || []), ...(j.jobs || [])];
        const seen = new Set<string>();
        for (const job of jobs) {
          if (seen.has(job.id)) continue;
          seen.add(job.id);
          const prev = prevStatus.current.get(job.id);
          prevStatus.current.set(job.id, job.status);
          if (!seeded.current) continue; // don't fire for pre-existing states on first pass
          const key = `${job.id}:${job.status}`;
          if (NOTIFY_STATES.has(job.status) && prev !== job.status && !notified.current.has(key)) {
            notified.current.add(key);
            fire(job);
          }
          const stuckKey = `${job.id}:stuck`;
          if (job.stuck && !notified.current.has(stuckKey)) {
            notified.current.add(stuckKey);
            fire({ ...job, status: "stuck" as any });
          }
        }
        seeded.current = true;
      } catch {
        /* ignore */
      }
    };

    poll();
    const t = setInterval(poll, 6000);
    return () => clearInterval(t);
  }, [enabled, permission, fire]);

  if (!supported) return null;

  const enable = async () => {
    let p = permission;
    if (p === "default") {
      p = await Notification.requestPermission();
      setPermission(p);
    }
    if (p === "granted") {
      setEnabled(true);
      localStorage.setItem(LS_KEY, "1");
      seeded.current = false; // reseed so we don't backfire on the first poll
    }
  };

  const disable = () => {
    setEnabled(false);
    localStorage.setItem(LS_KEY, "0");
  };

  let label = "🔔 Enable alerts";
  let onClick: (() => void) | undefined = enable;
  let cls = "text-accent border-accent/30 hover:bg-accent/10";
  if (permission === "denied") {
    label = "🔕 Alerts blocked";
    onClick = undefined;
    cls = "text-muted border-border cursor-not-allowed opacity-60";
  } else if (permission === "granted" && enabled) {
    label = "🔔 Alerts on";
    onClick = disable;
    cls = "text-good border-good/30 hover:bg-good/10";
  } else if (permission === "granted" && !enabled) {
    label = "🔕 Alerts off";
    onClick = enable;
    cls = "text-muted border-border hover:bg-panel-2";
  }

  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      title={
        permission === "denied"
          ? "Notifications are blocked for this site in your browser settings"
          : "Get notified when an agent finishes or needs you"
      }
      className={`w-full text-left text-[11px] px-2.5 py-1.5 rounded-lg border transition-colors ${cls}`}
    >
      {label}
    </button>
  );
}
