"use client";

// How Protégé looks: Classic (the original dark look) or Midnight (near-black, light-edged cards,
// Cal Sans headings, pill-shaped controls). Kept in this browser; the layout applies it before the
// page draws (see THEME_SCRIPT in app/layout.tsx). Shown in Settings.

import { useEffect, useState } from "react";
import Choice from "./Choice";

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
    <Choice
      label="How Protégé looks"
      value={theme}
      onChange={choose}
      options={[
        ["classic", "Classic"],
        ["midnight", "Midnight"],
      ]}
    />
  );
}
