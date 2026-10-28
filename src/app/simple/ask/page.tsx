"use client";

import { apiFetch } from "@/lib/api-client";
import { useEffect, useMemo, useState } from "react";
import Chat from "@/components/Chat";
import type { ProjectSummary } from "@/lib/types";

type Scope = { type: "brain" } | { type: "project"; id: string; name: string };

const BRAIN_STARTERS = [
  "What projects have I worked on, and what are they about?",
  "What have I learned that's worth remembering?",
  "Which of my projects deal with a similar problem?",
];
const PROJECT_STARTERS = [
  "In plain English, what is this project and what does it do?",
  "Where is this up to — what's finished and what's left?",
  "What should I be careful about here?",
  "How would I run or use this?",
];

export default function SimpleAsk() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [scope, setScope] = useState<Scope>({ type: "brain" });
  const [brainTitles, setBrainTitles] = useState<Record<string, string>>({});
  const [showTips, setShowTips] = useState(false);
  const [initialQ, setInitialQ] = useState("");

  useEffect(() => {
    apiFetch("/api/projects", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        const ps: ProjectSummary[] = (j.projects || []).filter((p: ProjectSummary) => p.exists);
        setProjects(ps);
        const params = new URLSearchParams(window.location.search);
        const pid = params.get("project");
        if (pid) {
          const p = ps.find((x) => x.id === pid);
          if (p) setScope({ type: "project", id: p.id, name: p.name });
        }
        const q = params.get("q");
        if (q) setInitialQ(q);
      })
      .catch(() => {});
    apiFetch("/api/brain", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
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
        return title ? `**${title}**` : m; // in simple view, show the name in bold rather than a technical link
      }),
    [brainTitles]
  );

  const isBrain = scope.type === "brain";
  const scopeKey = isBrain ? "brain" : (scope as any).id;
  const endpoint = isBrain ? "/api/brain/ask" : `/api/projects/${(scope as any).id}/ask`;

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-border px-8 py-4">
        <h1 className="text-xl font-bold">Ask Protégé</h1>
        <div className="flex items-center gap-3 mt-2 flex-wrap">
          <div className="flex items-center gap-2 text-sm text-muted">
            <span>About</span>
            <select
              value={scopeKey}
              onChange={(e) =>
                e.target.value === "brain"
                  ? setScope({ type: "brain" })
                  : (() => {
                      const p = projects.find((x) => x.id === e.target.value);
                      if (p) setScope({ type: "project", id: p.id, name: p.name });
                    })()
              }
              className="px-3 py-1.5 rounded-lg bg-panel border border-border text-sm text-text focus:outline-none focus:border-accent/60 max-w-[260px]"
            >
              <option value="brain">everything I&apos;ve worked on</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <button onClick={() => setShowTips((v) => !v)} className="text-xs text-accent hover:underline">
            {showTips ? "Hide tips" : "How should I ask?"}
          </button>
        </div>
        {showTips && (
          <div className="mt-3 rounded-xl border border-border bg-panel p-3.5 text-sm text-muted max-w-2xl">
            <div className="font-medium text-text mb-1.5">Tips for asking</div>
            <ul className="space-y-1 list-disc pl-5">
              <li>Ask in plain English, like you&apos;d ask a colleague. No special wording needed.</li>
              <li>Be specific about <em>what</em> you want and <em>which</em> project or part it&apos;s about.</li>
              <li>You can ask follow-up questions — it remembers the conversation.</li>
              <li>It only reads your work to answer. It won&apos;t change anything here.</li>
            </ul>
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 px-8 py-4 max-w-3xl w-full mx-auto">
        <Chat
          key={scopeKey}
          endpoint={endpoint}
          intro={
            isBrain
              ? "Ask about anything you've worked on. Protégé reads your notes and answers in plain English."
              : `Ask about ${(scope as any).name}. Protégé reads the project and answers — it won't change anything.`
          }
          starters={isBrain ? BRAIN_STARTERS : PROJECT_STARTERS}
          placeholder="Type your question…"
          initialInput={initialQ}
          linkify={isBrain ? linkify : undefined}
        />
      </div>
    </div>
  );
}
