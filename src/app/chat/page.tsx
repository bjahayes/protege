"use client";

// Chat: talk to Claude Code the way Claude desktop does. The list on the left is every saved
// Claude Code conversation on this computer (terminal, IDE, desktop and Protégé alike);
// open one to read it and carry on, or start a new chat in any project folder.

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ChatView from "@/components/chat/ChatView";
import { timeAgo } from "@/lib/format";

interface SessionRow {
  sessionId: string;
  cwd: string;
  projectId: string;
  projectName: string;
  title: string;
  lastModified: number;
  gitBranch?: string;
  status: string | null;
  /** When Protégé last worked in this conversation. */
  hereAt?: number;
}
interface ProjectRow {
  id: string;
  name: string;
  path: string;
  lastActivity: number | null;
  exists: boolean;
}

function ChatPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const sid = sp.get("s");
  const newFor = sp.get("project");

  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState("");
  const [picking, setPicking] = useState(false);
  // Remembers where a chat started here lives, until the saved list catches up.
  const [startedIn, setStartedIn] = useState<Record<string, ProjectRow>>({});

  const loadSessions = useCallback(() => {
    fetch(`/api/chat/sessions${filter ? `?projectId=${filter}` : ""}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setSessions(d.sessions || []))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [filter]);

  useEffect(() => {
    loadSessions();
    const t = setInterval(loadSessions, 8000);
    return () => clearInterval(t);
  }, [loadSessions]);

  useEffect(() => {
    fetch("/api/projects", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) =>
        setProjects(
          (d.projects || [])
            .filter((p: ProjectRow) => p.exists !== false)
            .sort((a: ProjectRow, b: ProjectRow) => (b.lastActivity || 0) - (a.lastActivity || 0))
        )
      )
      .catch(() => {});
  }, []);

  const current = sessions.find((s) => s.sessionId === sid);
  const project: ProjectRow | undefined = current
    ? { id: current.projectId, name: current.projectName, path: current.cwd, lastActivity: null, exists: true }
    : sid
      ? startedIn[sid]
      : projects.find((p) => p.id === newFor);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? sessions.filter((s) => s.title.toLowerCase().includes(q) || s.projectName.toLowerCase().includes(q)) : sessions;
  }, [sessions, search]);

  const startNew = (projectId: string) => {
    setPicking(false);
    router.push(`/chat?project=${projectId}`);
  };

  return (
    <div className="flex h-full min-h-0">
      <aside className="w-72 shrink-0 border-r border-border flex flex-col min-h-0">
        <div className="p-3 flex flex-col gap-2 border-b border-border">
          <div className="relative">
            <button
              onClick={() => setPicking(!picking)}
              className="w-full text-left px-3 py-2 rounded-lg bg-accent/15 border border-accent/40 text-accent hover:bg-accent/25 text-sm font-medium"
            >
              ＋ New chat
            </button>
            {picking && (
              <div className="absolute z-20 left-0 right-0 mt-1 max-h-80 overflow-y-auto rounded-lg border border-border bg-panel shadow-xl">
                <div className="px-3 py-1.5 text-[11px] text-muted border-b border-border">Which folder should Claude work in?</div>
                {projects.map((p) => (
                  <button key={p.id} onClick={() => startNew(p.id)} className="w-full text-left px-3 py-1.5 hover:bg-panel-2">
                    <div className="text-[13px]">{p.name}</div>
                    <div className="text-[10.5px] text-muted font-mono truncate">{p.path}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="text-[12px] bg-bg border border-border rounded-lg px-2 py-1.5 text-muted focus:outline-none"
          >
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search conversations"
            className="text-[12.5px] bg-bg border border-border rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-accent/50"
          />
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-1.5">
          {shown.map((s) => (
            <button
              key={s.sessionId}
              onClick={() => router.push(`/chat?s=${s.sessionId}`)}
              aria-label={`${s.title}, ${s.projectName}`}
              className={`w-full text-left px-2.5 py-2 rounded-lg mb-0.5 ${s.sessionId === sid ? "bg-panel-2" : "hover:bg-panel-2/60"}`}
            >
              <div className="text-[13px] leading-snug line-clamp-2 flex gap-1.5">
                {s.status && s.status !== "ended" && (
                  <span className={`mt-1.5 shrink-0 w-1.5 h-1.5 rounded-full ${s.status === "waiting" ? "bg-warn" : s.status === "idle" ? "bg-good" : "bg-accent live-dot"}`} />
                )}
                <span>{s.title}</span>
              </div>
              <div className="text-[11px] text-muted mt-0.5 truncate">
                {s.projectName} · {timeAgo(s.lastModified)}
              </div>
            </button>
          ))}
          {!shown.length && <div className="text-[12.5px] text-muted px-2.5 py-3">{loaded ? "No conversations yet." : "Loading conversations…"}</div>}
        </div>
      </aside>

      <section className="flex-1 min-w-0 min-h-0">
        {project ? (
          <ChatView
            key={sid ? `s:${sid}` : `p:${project.id}`}
            sessionId={sid}
            projectId={project.id}
            projectName={project.name}
            cwd={project.path}
            title={current?.title}
            lastModified={current?.lastModified}
            hereAt={current?.hereAt}
            onStarted={(id) => {
              setStartedIn((m) => ({ ...m, [id]: project }));
              router.replace(`/chat?s=${id}`);
              loadSessions();
            }}
          />
        ) : sid ? (
          <div className="p-8 text-sm text-muted">Loading…</div>
        ) : (
          <div className="h-full flex items-center justify-center text-center text-muted text-sm px-8">
            <div>
              <div className="text-lg text-text mb-1">Chat with Claude Code</div>
              Open a conversation on the left to read it and carry on, or start a new chat in one of your project folders.
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ChatPage />
    </Suspense>
  );
}
