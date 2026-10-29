"use client";

// How Protégé writes its explanations: everyday plain English, or Simplified Technical English
// (ASD-STE100): short sentences, one idea each, simple words with one meaning each. It applies to
// everything written for the person from then on: answers, summaries, plans, what changed.

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";

export default function ExplainStyleToggle() {
  const [style, setStyle] = useState<"plain" | "ste" | null>(null);
  const [info, setInfo] = useState(false);
  useEffect(() => {
    apiFetch("/api/settings", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setStyle(j.explainStyle === "ste" ? "ste" : "plain"))
      .catch(() => setStyle("plain"));
  }, []);
  if (!style) return null;
  const choose = (v: "plain" | "ste") => {
    setStyle(v);
    apiFetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ explainStyle: v }) }).catch(() => {});
  };
  return (
    <div className="rounded-lg border border-border px-3 py-2 text-[12px]">
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted">Explanations</span>
        <button onClick={() => setInfo((v) => !v)} aria-expanded={info} aria-label="About the explanation styles" className="text-muted hover:text-text">
          ⓘ
        </button>
      </div>
      <div className="mt-1.5 grid grid-cols-2 gap-1 rounded-md border border-border p-0.5" role="radiogroup" aria-label="How explanations are written">
        {(
          [
            ["plain", "Everyday"],
            ["ste", "Simplified"],
          ] as const
        ).map(([v, label]) => (
          <button
            key={v}
            role="radio"
            aria-checked={style === v}
            onClick={() => choose(v)}
            className={`px-2 py-1 rounded ${style === v ? "bg-panel-2 text-text font-medium" : "text-muted hover:text-text"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {info && (
        <p className="mt-2 text-muted leading-relaxed">
          <span className="text-text">Everyday</span> is plain, friendly English. <span className="text-text">Simplified</span> is
          Simplified Technical English (ASD-STE100): short sentences, one idea in each, and simple words with one meaning each. It
          applies to new answers, summaries, plans and change descriptions; refresh a summary to rewrite it.
        </p>
      )}
    </div>
  );
}
