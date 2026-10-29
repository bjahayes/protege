"use client";

// How Protégé looks: Classic (the original dark look), Midnight (near-black, Cal Sans headings,
// pill-shaped controls) or Paper (light: warm paper, serif headings, square edges, one deep red). Kept in this browser; the layout applies it before the
// page draws (see THEME_SCRIPT in app/layout.tsx). Shown in Settings.

import { useEffect, useState } from "react";
import Choice from "./Choice";

export type Theme = "classic" | "midnight" | "paper";
const KEY = "protege.theme";

export function currentTheme(): Theme {
  if (typeof document === "undefined") return "classic";
  const t = document.documentElement.dataset.theme;
  return t === "midnight" || t === "paper" ? t : "classic";
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
    if (t === "classic") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
    // Pieces drawn with colours worked out in code (the flowchart) redraw themselves.
    window.dispatchEvent(new CustomEvent("protege-theme", { detail: t }));
  };
  return (
    <Choice
      label="How Protégé looks"
      value={theme}
      onChange={choose}
      options={[
        ["classic", "Classic"],
        ["midnight", "Midnight"],
        ["paper", "Paper"],
      ]}
    />
  );
}
