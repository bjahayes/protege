"use client";

// How Protégé writes its explanations: everyday plain English, or Simplified Technical English
// (ASD-STE100): short sentences, one idea each, simple words with one meaning each. It applies to
// everything written for the person from then on: answers, summaries, plans, what changed.
// Shown in Settings.

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import Choice from "./Choice";

export default function ExplainStyleToggle() {
  const [style, setStyle] = useState<"plain" | "ste" | null>(null);
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
    <Choice
      label="How explanations are written"
      value={style}
      onChange={choose}
      options={[
        ["plain", "Everyday"],
        ["ste", "Simplified"],
      ]}
    />
  );
}
