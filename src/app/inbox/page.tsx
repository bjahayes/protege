"use client";

import { apiFetch } from "@/lib/api-client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { timeAgo } from "@/lib/format";
import { runTitle } from "@/lib/agents";

interface InboxItem {
  jobId: string;
  type: "approve" | "stuck" | "review" | "checks" | "failed";
  action: string;
  href: string;
  projectId: string;
  projectName: string;
  prompt: string;
  status: string;
  ts: number;
  branch?: string;
  /** From more than a week ago: folded away under "Older". */
  older?: boolean;
}

const TYPE_META: Record<string, { label: string; color: string; icon: string }> = {
  approve: { label: "Needs your OK", color: "var(--running)", icon: "✋" },
  stuck: { label: "Possibly stuck", color: "var(--warn)", icon: "⚠" },
  review: { label: "Review changes", color: "var(--good)", icon: "⎇" },
  checks: { label: "Checks failed", color: "var(--bad)", icon: "✗" },
  failed: { label: "Failed", color: "var(--bad)", icon: "✗" },
};

export default function InboxPage() {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await apiFetch("/api/inbox", { cache: "no-store" });
      const j = await r.json();
      setItems(j.items || []);
    } catch {
      /* ignore */
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <div className="p-6 max-w-[900px] mx-auto">
      <header className="mb-5">
        <h1 className="text-2xl font-bold">Inbox</h1>
        <p className="text-sm text-muted mt-0.5">Agent runs that need you — changes to review, failures, and stuck agents.</p>
      </header>

      {!loaded ? (
        <div className="text-muted text-sm py-20 text-center">Loading…</div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-20 text-center">
          <div className="text-3xl mb-3 opacity-60">✓</div>
          <p className="text-muted text-sm">All clear — nothing needs your attention.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {(() => {
            const current = items.filter((i) => !i.older);
            const older = items.filter((i) => i.older);
            const rows = (list: InboxItem[]) => (
              <div className="space-y-2">
                {list.map((it) => {
                  const m = TYPE_META[it.type];
                  return (
                    <Link
                      key={it.jobId}
                      href={it.href}
                      className="block rounded-xl border border-border bg-panel p-4 hover:border-accent/40"
                      style={{ borderLeft: `3px solid ${m.color}` }}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium px-1.5 py-0.5 rounded" style={{ background: `color-mix(in srgb, ${m.color} 13%, transparent)`, color: m.color }}>
                          {m.icon} {m.label}
                        </span>
                        <span className="text-sm text-muted">{it.projectName}</span>
                        {it.branch && <span className="text-[11px] text-muted font-mono">⎇ {it.branch}</span>}
                        <span className="text-[11px] text-muted ml-auto">{timeAgo(it.ts)}</span>
                      </div>
                      <div className="text-sm truncate">{runTitle(it)}</div>
                      <div className="text-[11px] text-accent mt-1">{it.action} →</div>
                    </Link>
                  );
                })}
              </div>
            );
            return (
              <>
                {current.length ? rows(current) : <p className="text-muted text-sm">Nothing from the last week needs you.</p>}
                {older.length > 0 && (
                  <details className="mt-6">
                    <summary className="text-sm text-muted cursor-pointer hover:text-text select-none">
                      Older, from more than a week ago ({older.length})
                    </summary>
                    <div className="mt-2 opacity-80">{rows(older)}</div>
                  </details>
                )}
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}
