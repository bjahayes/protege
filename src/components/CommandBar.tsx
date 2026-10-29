"use client";

import { apiFetch } from "@/lib/api-client";
import { useBrainAvailable } from "@/lib/use-brain";
import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { ProjectSummary } from "@/lib/types";

interface Cmd {
  id: string;
  label: string;
  hint?: string;
  href: string;
  group: string;
}

const NAV: Cmd[] = [
  { id: "nav-dash", label: "Dashboard", hint: "all projects", href: "/", group: "Go to" },
  { id: "nav-live", label: "Live agents", hint: "running now", href: "/live", group: "Go to" },
  { id: "nav-inbox", label: "Inbox", hint: "needs you", href: "/inbox", group: "Go to" },
  { id: "nav-agents", label: "Agents", hint: "runs & history", href: "/agents", group: "Go to" },
  { id: "nav-brain", label: "Brain", hint: "second brain", href: "/brain", group: "Go to" },
  { id: "nav-code", label: "Code", hint: "Claude Code sessions", href: "/chat", group: "Go to" },
  { id: "nav-costs", label: "Usage", hint: "plan limits", href: "/costs", group: "Go to" },
];

export default function CommandBar() {
  const router = useRouter();
  const brain = useBrainAvailable();
  const [open, setOpen] = useState(false);
  const [help, setHelp] = useState(false);
  const [query, setQuery] = useState("");
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const gPending = useRef(false);

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      setHelp(false);
      setQuery("");
      router.push(href);
    },
    [router]
  );

  // Load projects lazily when the palette opens.
  useEffect(() => {
    if (open && projects.length === 0) {
      apiFetch("/api/projects", { cache: "no-store" })
        .then((r) => r.json())
        .then((j) => setProjects(j.projects || []))
        .catch(() => {});
    }
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
  }, [open, projects.length]);

  const projectCmds: Cmd[] = projects
    .filter((p) => p.exists)
    .map((p) => ({ id: p.id, label: p.name, hint: p.path, href: `/projects/${p.id}`, group: "Projects" }));

  const all = [...NAV.filter((n) => brain || n.id !== "nav-brain"), ...projectCmds];
  const filtered = query
    ? all.filter((c) => (c.label + " " + (c.hint || "")).toLowerCase().includes(query.toLowerCase()))
    : all;

  useEffect(() => setSel(0), [query, open]);

  useEffect(() => {
    const inField = (el: EventTarget | null) => {
      const n = el as HTMLElement | null;
      return !!n && (n.tagName === "INPUT" || n.tagName === "TEXTAREA" || n.isContentEditable);
    };

    const onKey = (e: KeyboardEvent) => {
      // Command palette: Cmd/Ctrl+K (works anywhere)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (e.key === "Escape") {
        setOpen(false);
        setHelp(false);
        gPending.current = false;
        return;
      }

      // Palette navigation
      if (open) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSel((s) => Math.min(s + 1, filtered.length - 1));
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          setSel((s) => Math.max(s - 1, 0));
        } else if (e.key === "Enter") {
          e.preventDefault();
          const c = filtered[sel];
          if (c) go(c.href);
        }
        return;
      }

      if (inField(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;

      // ? opens help
      if (e.key === "?") {
        e.preventDefault();
        setHelp((v) => !v);
        return;
      }

      // G-chord leader
      if (gPending.current) {
        gPending.current = false;
        const map: Record<string, string> = {
          d: "/",
          l: "/live",
          i: "/inbox",
          a: "/agents",
          ...(brain ? { b: "/brain" } : {}),
          c: "/chat",
          u: "/costs",
        };
        const href = map[e.key.toLowerCase()];
        if (href) {
          e.preventDefault();
          go(href);
        }
        return;
      }
      if (e.key.toLowerCase() === "g") {
        gPending.current = true;
        setTimeout(() => (gPending.current = false), 1200);
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, filtered, sel, go, brain]);

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-start justify-center pt-[12vh] px-4" onClick={() => setOpen(false)}>
          <div
            className="w-full max-w-xl bg-panel border border-border rounded-xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Jump to a project or page…"
              className="w-full px-4 py-3 bg-transparent border-b border-border text-sm focus:outline-none"
            />
            <div className="max-h-[50vh] overflow-y-auto py-1">
              {filtered.length === 0 && <div className="px-4 py-6 text-center text-muted text-sm">No matches</div>}
              {filtered.map((c, i) => (
                <button
                  key={c.id}
                  onMouseEnter={() => setSel(i)}
                  onClick={() => go(c.href)}
                  className={`w-full text-left px-4 py-2 flex items-center gap-3 ${
                    i === sel ? "bg-panel-2" : ""
                  }`}
                >
                  <span className="text-[11px] uppercase tracking-wide text-muted/60 w-16 shrink-0">{c.group}</span>
                  <span className="text-sm truncate">{c.label}</span>
                  {c.hint && <span className="text-[11px] text-muted truncate ml-auto font-mono">{c.hint}</span>}
                </button>
              ))}
            </div>
            <div className="px-4 py-1.5 border-t border-border text-[11px] text-muted flex gap-3">
              <span>↑↓ navigate</span>
              <span>↵ open</span>
              <span>esc close</span>
            </div>
          </div>
        </div>
      )}

      {help && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center px-4" onClick={() => setHelp(false)}>
          <div className="bg-panel border border-border rounded-xl p-5 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-sm font-semibold mb-3">Keyboard shortcuts</h2>
            <div className="space-y-1.5 text-sm">
              <Row keys="⌘K / Ctrl K" label="Command palette" />
              <Row keys="G then D" label="Dashboard" />
              <Row keys="G then L" label="Live agents" />
              <Row keys="G then I" label="Inbox" />
              <Row keys="G then A" label="Agents" />
              {brain && <Row keys="G then B" label="Brain" />}
              <Row keys="G then C" label="Code" />
              <Row keys="G then U" label="Usage" />
              <Row keys="?" label="This help" />
              <Row keys="Esc" label="Close" />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Row({ keys, label }: { keys: string; label: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted">{label}</span>
      <kbd className="text-[11px] font-mono bg-bg border border-border rounded px-1.5 py-0.5">{keys}</kbd>
    </div>
  );
}
