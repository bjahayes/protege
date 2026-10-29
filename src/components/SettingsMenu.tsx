"use client";

// Settings: one window, opened from the foot of either sidebar, holding everything the person can
// choose about Protégé itself: how it looks, how it writes, demo projects, alerts, the Claude Code
// it runs, and (in the full view) loading Protégé's latest version.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { apiFetch } from "@/lib/api-client";
import { isDemoOn, setDemo } from "@/lib/demo-client";
import Choice from "./Choice";
import ThemeToggle from "./ThemeToggle";
import ExplainStyleToggle from "./ExplainStyleToggle";
import { AlertsSwitch } from "./NotificationCenter";
import RestartButton from "./RestartButton";

function Row({ title, children, control }: { title: string; children: React.ReactNode; control: React.ReactNode }) {
  return (
    <div className="py-3.5 border-t border-border first:border-t-0 flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
      <div className="min-w-0 flex-1 basis-56">
        <div className="text-[13.5px] font-medium">{title}</div>
        <div className="text-[12.5px] text-muted leading-relaxed mt-0.5">{children}</div>
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}

function DemoSwitch({ simple }: { simple: boolean }) {
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => setOn(isDemoOn()), []);
  if (on === null) return null;
  return (
    <Choice
      label="Demo mode"
      value={on ? "on" : "off"}
      onChange={(v) => {
        setDemo(v === "on");
        setOn(v === "on");
        // The projects on every page change, so start again from the home page.
        window.location.href = simple ? "/simple" : "/";
      }}
      options={[
        ["off", "Off"],
        ["on", "On"],
      ]}
    />
  );
}

interface Claude {
  installed: boolean;
  loggedIn: boolean;
  claudeVersion?: string | null;
  email?: string;
  subscriptionType?: string;
}

function ClaudeRow() {
  const [c, setC] = useState<Claude | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  useEffect(() => {
    apiFetch("/api/claude/status", { cache: "no-store" })
      .then((r) => r.json())
      .then(setC)
      .catch(() => {});
  }, []);
  const update = async () => {
    setBusy(true);
    setNote("");
    try {
      const r = await (await apiFetch("/api/claude/update", { method: "POST" })).json();
      setNote(r.ok ? `Claude Code is up to date${r.version ? ` (version ${r.version})` : ""}.` : r.message || "The update didn't finish.");
      const s = await (await apiFetch("/api/claude/status?refresh=1", { cache: "no-store" })).json();
      setC(s);
    } catch {
      setNote("The update didn't finish.");
    }
    setBusy(false);
  };
  const plan = c?.subscriptionType ? `Claude ${c.subscriptionType[0].toUpperCase()}${c.subscriptionType.slice(1)} plan` : null;
  return (
    <Row
      title="Claude Code"
      control={
        c?.installed ? (
          <button
            onClick={update}
            disabled={busy}
            className="text-[12.5px] px-3 py-1.5 rounded-lg border border-border text-muted hover:text-text hover:border-accent/40 disabled:opacity-60"
          >
            {busy ? "Updating…" : "Update Claude Code"}
          </button>
        ) : null
      }
    >
      {!c
        ? "Checking…"
        : !c.installed
          ? "Claude Code isn't installed on this computer. Protégé needs it to do any work."
          : !c.loggedIn
            ? "Claude Code is installed but not signed in. Use “Sign in to Claude” at the top of the page."
            : [c.email ? `Signed in as ${c.email}` : "Signed in", plan, c.claudeVersion ? `version ${c.claudeVersion}` : null]
                .filter(Boolean)
                .join(" · ") + ". Protégé does its work with this login, on this computer."}
      {note && <span className="block mt-1 text-text">{note}</span>}
    </Row>
  );
}

export default function SettingsMenu({ simple }: { simple: boolean }) {
  const [open, setOpen] = useState(false);
  const [aboutSte, setAboutSte] = useState(false);
  // Loading the latest version needs Protégé started with `npm start`; otherwise the row is left out.
  const [canRestart, setCanRestart] = useState(false);
  useEffect(() => {
    if (!open || simple) return;
    apiFetch("/api/restart", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setCanRestart(!!j.supported))
      .catch(() => {});
  }, [open, simple]);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="w-full text-left text-[12.5px] px-2.5 py-1.5 rounded-lg border border-border text-muted hover:text-text hover:border-accent/40 flex items-center gap-2"
      >
        <span aria-hidden="true">⚙</span>
        Settings
      </button>
      {/* Drawn on the page itself: inside the sidebar, its slide-in transform would hold the window to the sidebar's width. */}
      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-[60] bg-black/50 flex items-start justify-center px-4 pt-[8vh] pb-4"
            onClick={() => setOpen(false)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="settings-title"
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-xl max-h-full overflow-y-auto rounded-xl border border-border bg-panel shadow-2xl"
            >
              <div className="flex items-center justify-between gap-3 px-5 pt-4">
                <h2 id="settings-title" className="text-lg font-semibold">
                  Settings
                </h2>
                <button
                  onClick={() => setOpen(false)}
                  aria-label="Close settings"
                  className="w-8 h-8 rounded-lg text-muted hover:text-text hover:bg-panel-2"
                >
                  ✕
                </button>
              </div>
              <p className="px-5 text-[12.5px] text-muted">
                How Protégé looks and writes, what it shows you, and the Claude Code it works with.
              </p>
              <div className="px-5 pt-2 pb-4">
                <Row title="Look" control={<ThemeToggle />}>
                  Classic is Protégé’s original dark look. Midnight is near-black, with rounder controls. Paper is light: warm paper, serif headings and square edges. Kept in this
                  browser.
                </Row>
                <Row title="Explanations" control={<ExplainStyleToggle />}>
                  How Protégé writes answers, summaries, plans and what changed.{" "}
                  <button
                    onClick={() => setAboutSte((v) => !v)}
                    aria-expanded={aboutSte}
                    aria-label="About the explanation styles"
                    className="hover:text-text"
                  >
                    ⓘ
                  </button>
                  {aboutSte && (
                    <span className="block mt-1">
                      <span className="text-text">Everyday</span> is plain, friendly English. <span className="text-text">Simplified</span>{" "}
                      is Simplified Technical English (ASD-STE100): short sentences, one idea in each, and simple words with one meaning
                      each. New writing follows the choice; refresh a summary to rewrite it.
                    </span>
                  )}
                </Row>
                <Row title="Demo mode" control={<DemoSwitch simple={simple} />}>
                  Shows made-up example projects instead of yours, for trying Protégé out or showing it to someone.
                </Row>
                <Row title="Alerts" control={<AlertsSwitch />}>
                  A browser alert when a task finishes, fails or needs your answer, even while Protégé is in a background tab.
                </Row>
                <ClaudeRow />
                {!simple && canRestart && (
                  <Row title="Protégé’s latest version" control={<RestartButton />}>
                    Builds Protégé’s newest code, then restarts on it once no session or task is mid-turn. Sessions carry on from their
                    saved history.
                  </Row>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
