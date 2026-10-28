"use client";

import { apiFetch } from "@/lib/api-client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { fmtCost, fmtTokens, timeAgo } from "@/lib/format";

interface ProjectCost {
  projectId: string;
  name: string;
  runs: number;
  cost: number;
  inputTokens: number;
  outputTokens: number;
  lastRun: number;
}
interface CostData {
  totals: { runs: number; cost: number; inputTokens: number; outputTokens: number };
  byProject: ProjectCost[];
  byKind: { kind: string; runs: number; cost: number }[];
  byModel: { model: string; runs: number; cost: number }[];
}

export default function CostsPage() {
  const [data, setData] = useState<CostData | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await apiFetch("/api/costs", { cache: "no-store" });
      setData(await r.json());
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  if (!data) return <div className="p-6 text-muted text-sm">Loading…</div>;

  const maxCost = Math.max(...data.byProject.map((p) => p.cost), 0.0001);

  return (
    <div className="p-6 max-w-[1100px] mx-auto">
      <header className="mb-5">
        <h1 className="text-2xl font-bold">Cost & usage</h1>
        <p className="text-sm text-muted mt-0.5">
          Across every agent Protégé has launched. An estimate from the Agent SDK, not a billing statement.
        </p>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Stat label="Total cost" value={fmtCost(data.totals.cost)} accent="text-good" />
        <Stat label="Agent runs" value={String(data.totals.runs)} />
        <Stat label="Input tokens" value={fmtTokens(data.totals.inputTokens)} />
        <Stat label="Output tokens" value={fmtTokens(data.totals.outputTokens)} />
      </div>

      <section className="mb-6">
        <h2 className="text-sm font-semibold text-muted mb-2">By project</h2>
        {data.byProject.length === 0 ? (
          <p className="text-muted text-sm">No runs yet.</p>
        ) : (
          <div className="rounded-xl border border-border bg-panel divide-y divide-border">
            {data.byProject.map((p) => (
              <div key={p.projectId} className="px-4 py-3">
                <div className="flex items-center justify-between gap-3 mb-1.5">
                  <Link href={`/projects/${p.projectId}`} className="font-medium hover:text-accent truncate">
                    {p.name}
                  </Link>
                  <div className="flex items-center gap-4 text-[11px] text-muted shrink-0">
                    <span>{p.runs} runs</span>
                    <span>{fmtTokens(p.inputTokens + p.outputTokens)} tok</span>
                    <span>last {timeAgo(p.lastRun)}</span>
                    <span className="text-good font-medium w-14 text-right">{fmtCost(p.cost)}</span>
                  </div>
                </div>
                <div className="h-1.5 rounded-full bg-panel-2 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-accent to-good"
                    style={{ width: `${Math.max(2, (p.cost / maxCost) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Breakdown title="By kind" rows={data.byKind.map((r) => ({ label: r.kind, runs: r.runs, cost: r.cost }))} />
        <Breakdown
          title="By model"
          rows={data.byModel.map((r) => ({ label: r.model, runs: r.runs, cost: r.cost }))}
        />
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-xl border border-border bg-panel p-3.5">
      <div className={`text-2xl font-bold ${accent || "text-text"}`}>{value}</div>
      <div className="text-[11px] text-muted mt-0.5">{label}</div>
    </div>
  );
}

function Breakdown({ title, rows }: { title: string; rows: { label: string; runs: number; cost: number }[] }) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-muted mb-2">{title}</h2>
      <div className="rounded-xl border border-border bg-panel divide-y divide-border">
        {rows.length === 0 && <div className="px-4 py-3 text-muted text-sm">—</div>}
        {rows.map((r) => (
          <div key={r.label} className="px-4 py-2.5 flex items-center justify-between text-sm">
            <span className="font-mono text-xs truncate">{r.label}</span>
            <div className="flex items-center gap-4 text-[11px] text-muted shrink-0">
              <span>{r.runs} runs</span>
              <span className="text-good font-medium w-14 text-right">{fmtCost(r.cost)}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
