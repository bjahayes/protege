"use client";

// How Protégé looks: Classic (the original dark look) or Midnight (near-black, light-edged cards,
// Cal Sans headings, pill-shaped controls). Kept in this browser; the layout applies it before the
// page draws (see THEME_SCRIPT in app/layout.tsx).

import { useEffect, useState } from "react";

export type Theme = "classic" | "midnight";
const KEY = "protege.theme";

export function currentTheme(): Theme {
  if (typeof document === "undefined") return "classic";
  return document.documentElement.dataset.theme === "midnight" ? "midnight" : "classic";
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);
  useEffect(() => setTheme(currentTheme()), []);
  if (!theme) return null;
  const choose = (t: Theme) => {
    setTheme(t);
    try {
      localStorage.setItem(KEY, t);
    } catch {}
    if (t === "midnight") document.documentElement.dataset.theme = "midnight";
    else delete document.documentElement.dataset.theme;
    // Pieces drawn with colours worked out in code (the flowchart) redraw themselves.
    window.dispatchEvent(new CustomEvent("protege-theme", { detail: t }));
  };
  return (
    <div className="rounded-lg border border-border px-3 py-2 text-[12px]">
      <span className="text-muted">Look</span>
      <div className="mt-1.5 grid grid-cols-2 gap-1 rounded-md border border-border p-0.5" role="radiogroup" aria-label="How Protégé looks">
        {(
          [
            ["classic", "Classic"],
            ["midnight", "Midnight"],
          ] as const
        ).map(([v, label]) => (
          <button
            key={v}
            role="radio"
            aria-checked={theme === v}
            onClick={() => choose(v)}
            className={`px-2 py-1 rounded ${theme === v ? "bg-panel-2 text-text font-medium" : "text-muted hover:text-text"}`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
