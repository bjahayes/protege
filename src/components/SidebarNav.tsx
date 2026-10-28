"use client";

import { apiFetch } from "@/lib/api-client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export default function SidebarNav() {
  const pathname = usePathname();
  const [liveCount, setLiveCount] = useState(0);
  const [inboxCount, setInboxCount] = useState(0);

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

  const items = [
    { href: "/", label: "Dashboard", icon: "▦" },
    { href: "/chat", label: "Chat", icon: "✎" },
    { href: "/assistant", label: "Assistant", icon: "✧" },
    { href: "/live", label: "Live", icon: "◉", badge: liveCount || undefined },
    { href: "/inbox", label: "Inbox", icon: "✉", badge: inboxCount || undefined, badgeColor: "warn" },
    { href: "/agents", label: "Agents", icon: "◎" },
    { href: "/brain", label: "Brain", icon: "🧠" },
    { href: "/costs", label: "Cost & usage", icon: "$" },
  ];

  return (
    <nav className="p-2 flex flex-col gap-0.5 text-sm">
      {items.map((it) => {
        const activeRoute = it.href === "/" ? pathname === "/" : pathname.startsWith(it.href);
        return (
          <Link
            key={it.href}
            href={it.href}
            className={`px-3 py-2 rounded-md flex items-center gap-2 transition-colors ${
              activeRoute ? "bg-panel-2 text-text" : "text-muted hover:bg-panel-2 hover:text-text"
            }`}
          >
            <span className="w-4 text-center opacity-70">{it.icon}</span>
            {it.label}
            {it.badge !== undefined && (
              <span
                className={`ml-auto inline-flex items-center gap-1 text-[11px] font-medium ${
                  (it as any).badgeColor === "warn" ? "text-warn" : "live-dot text-running"
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${(it as any).badgeColor === "warn" ? "bg-warn" : "bg-running"}`}
                />
                {it.badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
