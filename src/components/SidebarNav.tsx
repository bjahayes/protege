"use client";

import { apiFetch } from "@/lib/api-client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useBrainAvailable } from "@/lib/use-brain";

interface Item {
  href: string;
  label: string;
  icon: string;
  badge?: number;
  warn?: boolean;
}

// The Orchestrator group (the agents Protégé runs) is open or closed as the person last left it.
const OPEN_KEY = "protege.nav.orchestrator";

export default function SidebarNav() {
  const pathname = usePathname();
  const [liveCount, setLiveCount] = useState(0);
  const [inboxCount, setInboxCount] = useState(0);
  const [open, setOpen] = useState(true);
  const brain = useBrainAvailable();

  useEffect(() => {
    try {
      if (localStorage.getItem(OPEN_KEY) === "0") setOpen(false);
    } catch {}
  }, []);
  const toggle = () =>
    setOpen((o) => {
      try {
        localStorage.setItem(OPEN_KEY, o ? "0" : "1");
      } catch {}
      return !o;
    });

  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const [jobs, inbox] = await Promise.all([
          apiFetch("/api/jobs", { cache: "no-store" }).then((r) => r.json()),
          apiFetch("/api/inbox", { cache: "no-store" }).then((r) => r.json()),
        ]);
        if (!stop) {
          setLiveCount((jobs.live || []).length);
          setInboxCount(inbox.count || 0);
        }
      } catch {
        /* ignore */
      }
    };
    load();
    const t = setInterval(load, 4000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, []);

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const top: Item[] = [
    { href: "/", label: "Dashboard", icon: "▦" },
    { href: "/chat", label: "Code", icon: "✎" },
    { href: "/assistant", label: "Assistant", icon: "✧" },
  ];
  const orchestrator: Item[] = [
    { href: "/live", label: "Live", icon: "◉", badge: liveCount || undefined },
    { href: "/agents", label: "Agents", icon: "◎" },
    { href: "/inbox", label: "Inbox", icon: "✉", badge: inboxCount || undefined, warn: true },
  ];
  const bottom: Item[] = [
    ...(brain ? [{ href: "/brain", label: "Brain", icon: "🧠" }] : []),
    { href: "/costs", label: "Usage", icon: "◔" },
  ];
  // Always open while one of its pages is showing, so the current page is never hidden.
  const inGroup = orchestrator.some((i) => isActive(i.href));
  const shown = open || inGroup;

  return (
    <nav className="p-2 flex flex-col gap-0.5 text-sm">
      {top.map((it) => (
        <NavLink key={it.href} it={it} active={isActive(it.href)} />
      ))}

      <button
        onClick={toggle}
        aria-expanded={shown}
        className="px-3 py-2 rounded-md flex items-center gap-2 text-muted hover:bg-panel-2 hover:text-text text-left"
      >
        <span className="w-4 text-center opacity-70">⌬</span>
        Orchestrator
        {!shown && (liveCount > 0 || inboxCount > 0) && (
          <span className="ml-auto flex items-center gap-2">
            {liveCount > 0 && <Badge n={liveCount} />}
            {inboxCount > 0 && <Badge n={inboxCount} warn />}
          </span>
        )}
        <span className={`${shown || !(liveCount || inboxCount) ? "ml-auto" : ""} text-[11px] opacity-60`}>{shown ? "▾" : "▸"}</span>
      </button>
      {shown && (
        <div className="ml-3 pl-2 border-l border-border flex flex-col gap-0.5">
          {orchestrator.map((it) => (
            <NavLink key={it.href} it={it} active={isActive(it.href)} />
          ))}
        </div>
      )}

      {bottom.map((it) => (
        <NavLink key={it.href} it={it} active={isActive(it.href)} />
      ))}
    </nav>
  );
}

function NavLink({ it, active }: { it: Item; active: boolean }) {
  return (
    <Link
      href={it.href}
      className={`px-3 py-2 rounded-md flex items-center gap-2 transition-colors ${
        active ? "bg-panel-2 text-text" : "text-muted hover:bg-panel-2 hover:text-text"
      }`}
    >
      <span className="w-4 text-center opacity-70">{it.icon}</span>
      {it.label}
      {it.badge !== undefined && (
        <span className="ml-auto">
          <Badge n={it.badge} warn={it.warn} />
        </span>
      )}
    </Link>
  );
}

function Badge({ n, warn }: { n: number; warn?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${warn ? "text-warn" : "live-dot text-running"}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${warn ? "bg-warn" : "bg-running"}`} />
      {n}
    </span>
  );
}
