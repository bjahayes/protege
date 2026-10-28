"use client";

import { apiFetch } from "@/lib/api-client";
import { useEffect, useMemo, useState } from "react";
import Chat from "@/components/Chat";
import type { ProjectSummary } from "@/lib/types";

type Scope = { type: "brain" } | { type: "project"; id: string; name: string };

const BRAIN_STARTERS = [
  "What techniques show up across the most projects?",
  "What have I learned about evaluating LLM outputs?",
  "Summarize my approach to agent architectures.",
  "Which decisions recur, and where did they come from?",
];
const PROJECT_STARTERS = [
  "What does this project do, and what's the entry point?",
  "Give me a tour of the architecture.",
  "What's most likely broken or unfinished?",
  "How do I run and test it?",
];

export default function AssistantPage() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [scope, setScope] = useState<Scope>({ type: "brain" });
  const [brainTitles, setBrainTitles] = useState<Record<string, string>>({});
  const [brainAvailable, setBrainAvailable] = useState(true);

  useEffect(() => {
    apiFetch("/api/projects", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        const ps: ProjectSummary[] = (j.projects || []).filter((p: ProjectSummary) => p.exists);
        setProjects(ps);
        // deep link: ?project=<id> or ?scope=brain
        const params = new URLSearchParams(window.location.search);
        const pid = params.get("project");
        if (pid) {
          const p = ps.find((x) => x.id === pid);
          if (p) setScope({ type: "project", id: p.id, name: p.name });
        }
      })
      .catch(() => {});
    apiFetch("/api/brain", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        setBrainAvailable(!!j.available);
        const map: Record<string, string> = {};
        for (const n of j.notes || []) map[n.slug] = n.title || n.slug;
        for (const p of j.projects || []) map[p.slug] = p.title || p.slug;
        setBrainTitles(map);
      })
      .catch(() => {});
  }, []);

  const linkify = useMemo(
    () => (text: string) =>
      text.replace(/\[\[([a-z0-9][a-z0-9-]*)\]\]/gi, (m, slug) => {
        const title = brainTitles[slug];
        return title ? `[${title}](/brain?item=${slug})` : m;
      }),
    [brainTitles]
  );

  const isBrain = scope.type === "brain";
  const endpoint = isBrain ? "/api/brain/ask" : `/api/projects/${(scope as any).id}/ask`;
  const scopeKey = isBrain ? "brain" : (scope as any).id;

  const onScope = (val: string) => {
    if (val === "brain") setScope({ type: "brain" });
    else {
      const p = projects.find((x) => x.id === val);
      if (p) setScope({ type: "project", id: p.id, name: p.name });
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-border px-6 py-3 flex items-center justify-between gap-3">
        <h1 className="text-lg font-bold flex items-center gap-2">✧ Assistant</h1>
        <div className="flex items-center gap-2 text-xs text-muted">
          <span>Ask about</span>
          <select
            value={scopeKey}
            onChange={(e) => onScope(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg bg-panel border border-border text-sm text-text focus:outline-none focus:border-accent/60 max-w-[260px]"
          >
            <option value="brain" disabled={!brainAvailable}>
              🧠 The brain (all projects)
            </option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex-1 min-h-0 px-6 py-4 max-w-3xl w-full mx-auto">
        <Chat
          key={scopeKey}
          endpoint={endpoint}
          intro={
            isBrain
              ? "Answers across all your projects and notes — it reads your second brain and cites the specific notes it used."
              : `Grounded in ${(scope as any).name}'s code, assessment and brain notes. Read-only — it reads files to answer.`
          }
          starters={isBrain ? BRAIN_STARTERS : PROJECT_STARTERS}
          placeholder={isBrain ? "Ask across everything you've built…" : "Ask about this project…"}
          linkify={isBrain ? linkify : undefined}
        />
      </div>
    </div>
  );
}
