"use client";

import { apiFetch } from "@/lib/api-client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Job } from "@/lib/types";
import { runTitle } from "@/lib/agents";
import Choice from "./Choice";

const NOTIFY_STATES = new Set(["done", "error", "idle"]);
const LS_KEY = "protege_notify_enabled";
const EVENT = "protege-alerts";

// Watches the jobs and raises a browser alert when one finishes, fails or needs the person.
// Always mounted (AppShell); the switch that turns it on is AlertsSwitch, in Settings.
export default function NotificationCenter() {
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [enabled, setEnabled] = useState(false);

  const prevStatus = useRef<Map<string, string>>(new Map());
  const notified = useRef<Set<string>>(new Set());
  const seeded = useRef(false);

  // Register SW + read initial permission/preference.
  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    setPermission(Notification.permission);
    setEnabled(localStorage.getItem(LS_KEY) === "1");
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    const changed = () => {
      setPermission(Notification.permission);
      setEnabled(localStorage.getItem(LS_KEY) === "1");
      seeded.current = false; // reseed so we don't backfire on the first poll
    };
    window.addEventListener(EVENT, changed);
    return () => window.removeEventListener(EVENT, changed);
  }, []);

  const fire = useCallback(async (job: Job) => {
    const isolated = job.worktreeState && job.worktreeState !== "none" && job.worktreeState === "active";
    let title = "";
    if ((job.status as string) === "stuck") title = `⚠ Agent may be stuck — ${job.projectName}`;
    else if (job.status === "done" && job.kind === "plan") title = `✓ A plan is ready to approve — ${job.projectName}`;
    else if (job.status === "done") title = isolated ? `✓ Ready to review — ${job.projectName}` : `✓ Agent finished — ${job.projectName}`;
    else if (job.status === "error") title = `✗ Agent failed — ${job.projectName}`;
    else if (job.status === "idle") title = `🖐 Agent needs you — ${job.projectName}`;
    else return;

    const body = runTitle(job).slice(0, 140);
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

  return null;
}

/** The Alerts row in Settings: asks the browser for permission and turns the alerts on or off. */
export function AlertsSwitch() {
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    setSupported(true);
    setPermission(Notification.permission);
    setEnabled(localStorage.getItem(LS_KEY) === "1");
  }, []);

  if (!supported) return <span className="text-[12px] text-muted">Not available in this browser</span>;
  if (permission === "denied")
    return <span className="text-[12px] text-muted text-right">Blocked in this browser’s site settings</span>;

  const save = (on: boolean) => {
    setEnabled(on);
    localStorage.setItem(LS_KEY, on ? "1" : "0");
    window.dispatchEvent(new CustomEvent(EVENT));
  };
  const choose = async (v: "on" | "off") => {
    if (v === "off") return save(false);
    let p: NotificationPermission = permission;
    if (p === "default") {
      p = await Notification.requestPermission();
      setPermission(p);
    }
    if (p === "granted") save(true);
  };
  return (
    <Choice
      label="Alerts"
      value={permission === "granted" && enabled ? "on" : "off"}
      onChange={choose}
      options={[
        ["off", "Off"],
        ["on", "On"],
      ]}
    />
  );
}
