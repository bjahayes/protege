"use client";

import { apiFetch } from "@/lib/api-client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import type { Mission } from "@/lib/mission-manager";
import { fmtDuration } from "@/lib/format";

export default function MissionBar({
  projectId,
  gitRepo,
  todoCount,
  onChange,
}: {
  projectId: string;
  gitRepo?: boolean;
  todoCount: number;
  onChange: () => void;
}) {
  const [mission, setMission] = useState<Mission | null>(null);
  const [isolate, setIsolate] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await apiFetch(`/api/projects/${projectId}/mission`, { cache: "no-store" });
      const j = await r.json();
      setMission(j.mission || null);
    } catch {
      /* ignore */
    }
  }, [projectId]);

  useEffect(() => {
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [load]);

  const running = mission?.status === "running";

  // Refresh the task board when the mission advances tasks.
  useEffect(() => {
    if (mission) onChange();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mission?.currentIndex, mission?.status]);

  const start = async () => {
    setBusy(true);
    await apiFetch(`/api/projects/${projectId}/mission`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "start", isolate: isolate && gitRepo, autoResume: true }),
    });
    await load();
    setBusy(false);
  };

  const stop = async () => {
    setBusy(true);
    await apiFetch(`/api/projects/${projectId}/mission`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "stop" }),
    });
    await load();
    setBusy(false);
  };

  if (running) {
    const done = mission!.tasks.filter((t) => t.state === "done").length;
    const total = mission!.tasks.length;
    const current = mission!.tasks[mission!.currentIndex];
    return (
      <div className="rounded-xl border border-running/30 bg-running/5 p-4 mb-4">
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="flex items-center gap-2">
            <span className="live-dot inline-flex items-center gap-1.5 text-sm text-running font-medium">
              <span className="w-2 h-2 rounded-full bg-running" /> Mission running
            </span>
            <span className="text-xs text-muted">
              {done}/{total} done · {fmtDuration(mission!.startedAt)}
            </span>
          </div>
          <button
            onClick={stop}
            disabled={busy}
            className="px-2.5 py-1 rounded-lg border border-bad/40 text-bad hover:bg-bad/15 text-xs font-medium"
          >
            ⨯ Stop mission
          </button>
        </div>
        <div className="h-1.5 rounded-full bg-panel-2 overflow-hidden mb-2">
          <div className="h-full rounded-full bg-running transition-all" style={{ width: `${(done / total) * 100}%` }} />
        </div>
        {current && (
          <div className="text-xs text-muted">
            Now: <span className="text-text">{current.title}</span>
            {current.jobId && (
              <Link href={`/agents?job=${current.jobId}`} className="text-accent ml-2 hover:underline">
                watch →
              </Link>
            )}
          </div>
        )}
        <div className="flex flex-wrap gap-1 mt-2">
          {mission!.tasks.map((t) => (
            <span
              key={t.taskId}
              title={`${t.title} — ${t.state}`}
              className={`w-2.5 h-2.5 rounded-full ${
                t.state === "done"
                  ? "bg-good"
                  : t.state === "running"
                  ? "bg-running live-dot"
                  : t.state === "failed"
                  ? "bg-bad"
                  : "bg-panel-2 border border-border"
              }`}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-panel p-4 mb-4 flex items-center justify-between gap-3">
      <div>
        <div className="text-sm font-medium">Run as a mission</div>
        <div className="text-[11px] text-muted">
          Dispatch an agent for each to-do task in turn, marking them done as it goes.
          {mission && mission.status !== "running" && (
            <span>
              {" "}
              Last run: {mission.tasks.filter((t) => t.state === "done").length}/{mission.tasks.length} done ({mission.status}).
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {gitRepo && (
          <label className="flex items-center gap-1.5 text-[11px] text-muted cursor-pointer">
            <input type="checkbox" checked={isolate} onChange={(e) => setIsolate(e.target.checked)} />
            isolate each
          </label>
        )}
        <button
          onClick={start}
          disabled={busy || todoCount === 0}
          className="px-3.5 py-2 rounded-lg bg-running/20 border border-running/40 text-running hover:bg-running/30 text-sm font-semibold disabled:opacity-40"
          title={todoCount === 0 ? "No to-do tasks" : ""}
        >
          ▶ Run {todoCount} task{todoCount === 1 ? "" : "s"}
        </button>
      </div>
    </div>
  );
}
