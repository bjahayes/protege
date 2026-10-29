"use client";

// Restart Protégé to load its latest code: builds the new version, waits until no session or
// task is mid-turn, then swaps (src/lib/restart.ts). Shown only when Protégé was started with
// `npm start`, which is what makes the swap possible. The button is in Settings; the sidebar shows
// only the progress (`statusOnly`), so a restart under way is visible with Settings closed.

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import type { RestartState } from "@/lib/restart";

export default function RestartButton({ statusOnly = false }: { statusOnly?: boolean }) {
  const [s, setS] = useState<RestartState | null>(null);
  const [down, setDown] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await apiFetch("/api/restart", { cache: "no-store" });
      setS(await r.json());
      setDown(false);
    } catch {
      setDown(true); // between the old server stopping and the new one answering
    }
  }, []);

  const active = !!s && (s.phase === "building" || s.phase === "waiting" || s.phase === "restarting");
  useEffect(() => {
    load();
    const t = setInterval(load, active || down ? 1500 : 30_000);
    return () => clearInterval(t);
  }, [load, active, down]);

  const post = async (body: object) => {
    const r = await apiFetch("/api/restart", { method: "POST", body: JSON.stringify(body) }).catch(() => null);
    if (r) setS(await r.json());
  };

  if (!s?.supported) return null;
  if (down || s.phase === "restarting") return <div className="text-[11px] text-accent px-1">Restarting on the new version…</div>;
  if (s.phase === "building") return <div className="text-[11px] text-muted px-1">Building the new version…</div>;
  if (s.phase === "waiting")
    return (
      <div className="text-[11px] text-muted px-1 leading-snug">
        New version built. Restarting once {s.waitingFor?.length ? s.waitingFor.join(", ") : "nothing is running"}{" "}
        {s.waitingFor && s.waitingFor.length > 1 ? "finish" : "finishes"}.{" "}
        <button
          onClick={() => {
            if (
              confirm(
                `Restart now? ${s.waitingFor?.length ? `This stops ${s.waitingFor.join(", ")} partway; it` : "Anything running"} carries on from its saved history.`,
              )
            )
              post({ action: "force" });
          }}
          className="underline hover:text-text"
        >
          Restart now
        </button>{" "}
        ·{" "}
        <button onClick={() => post({ action: "cancel" })} className="underline hover:text-text">
          Cancel
        </button>
      </div>
    );
  if (statusOnly && s.phase !== "failed") return null;
  return (
    <div className="px-1">
      {s.phase === "failed" && (
        <div className="text-[11px] text-bad leading-snug mb-1.5">
          {s.error}{" "}
          <button onClick={() => post({ action: "cancel" })} className="underline">
            OK
          </button>
        </div>
      )}
      {!statusOnly && (
        <button
          onClick={() => post({})}
          title="Builds Protégé's latest code, then restarts on it once no session or task is mid-turn"
          className="w-full text-[11px] px-2.5 py-1.5 rounded-lg border border-border text-muted hover:text-text hover:border-accent/40"
        >
          ↻ Load latest version
        </button>
      )}
    </div>
  );
}
