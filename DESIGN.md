# Protégé — Design Doc

> Mission control for large Claude Code projects. See where every project is, what's built, what's left, and orchestrate multiple agents from one place.

Status: **v0.1 — prototype**  ·  Last updated: 2026-08-19

---

## 1. Problem

Claude Code is excellent for small, well-scoped prompts. But on projects that run for days or weeks, you lose the thread:

- **Where is this up to?** What's designed, what's built, what's in progress, what's left.
- **What was the AI working on?** Which files/subsystems, which decisions, which session.
- **Too many moving parts.** Multiple agents, multiple projects — no single view of status or live context.
- **Best practices don't stick.** Design docs, plans, task lists, CLAUDE.md — easy to know about, hard to keep current.

Protégé is a local web app that gives you **one screen per project** answering "where is this and how's it going," plus a **control plane** to launch and watch multiple Claude Code agents.

## 2. Goals / Non-goals

**Goals**
- Auto-discover existing Claude Code projects + let you register any folder.
- Per-project view: design, plan, tasks (todo / doing / done), recent sessions, current status.
- Trigger coding jobs from the UI (via the Claude Agent SDK) against a chosen project.
- Manage **multiple concurrent agents** — live status, streaming context, token/cost, stop/resume.
- Bake in large-project best practices as a **first-class, editable structure** the tool maintains.

**Non-goals (v0.1)**
- Not a Claude Code replacement or a general IDE.
- No cloud/multi-user; single local user, `localhost` only.
- No git hosting integration yet (worktrees are on the roadmap, not v0.1).

## 3. Core concepts

| Concept | What it is |
|---|---|
| **Project** | A folder on disk you do Claude Code work in. Discovered from `~/.claude/projects` or registered manually. |
| **Docs** | The project's `design.md`, `plan.md`, `tasks.json`, `CLAUDE.md`. Protégé reads, renders, and can scaffold these. |
| **Session** | A historical Claude Code run, read from the `*.jsonl` transcript on disk. |
| **Job / Agent** | A run Protégé launches via the Agent SDK. While live it's an **agent** with streaming status; when done it's a session. |

## 4. Best practices, baked in

Protégé promotes a lightweight, standard structure in every managed project. Nothing proprietary — just files Claude Code already understands:

```
<project>/
  CLAUDE.md          # durable memory: architecture, conventions, gotchas
  DESIGN.md          # what we're building & why (this file's cousin)
  PLAN.md            # phased plan; checkboxes for milestones
  .protege/
    tasks.json       # structured task board: todo / doing / done
    status.md        # auto-summarized "where it's up to" (regenerated)
    project.json     # protege metadata (name, tags, registered date)
```

Principles encoded in the UI and job templates:
1. **Plan before build.** New work starts from a plan; the UI nudges you to plan-mode a task before running it.
2. **One source of truth per axis.** Design (why) ≠ Plan (how/when) ≠ Tasks (what now). Separate files, cross-linked.
3. **Keep CLAUDE.md fresh.** After big changes, a job can update CLAUDE.md so future agents start informed.
4. **Small, scoped tasks.** The task board pushes decomposition; each task maps to one agent run.
5. **Status is generated, not hand-maintained.** `status.md` is rebuilt from tasks + recent sessions.
6. **Parallelism with isolation.** Multiple agents OK; roadmap adds git-worktree isolation so they don't collide.

## 5. Architecture

Single Next.js (App Router, TypeScript) app on `localhost:4317`. One Node process, so a module-level singleton can own live agents.

```
┌─────────────────────────── Browser (React) ───────────────────────────┐
│  Dashboard  │  Project detail (docs/plan/tasks/sessions)  │  Agents    │
└───────────▲──────────────────────────▲───────────────────────▲────────┘
            │ fetch / server actions    │ SSE (live agent stream)│
┌───────────┴──────────────────────────┴───────────────────────┴────────┐
│                        Next.js server (Node)                            │
│  ┌────────────┐  ┌──────────────┐  ┌───────────────┐  ┌─────────────┐  │
│  │ discovery  │  │  docs I/O    │  │  JobManager   │  │  store      │  │
│  │ (~/.claude │  │ read/write   │  │  (singleton): │  │ (SQLite:    │  │
│  │  /projects)│  │ design/plan/ │  │  runs Agent   │  │  projects,  │  │
│  │            │  │ tasks/status │  │  SDK query(), │  │  jobs)      │  │
│  │            │  │              │  │  streams+logs │  │             │  │
│  └────────────┘  └──────────────┘  └───────▲───────┘  └─────────────┘  │
└───────────────────────────────────────────┼───────────────────────────┘
                                             │ @anthropic-ai/claude-agent-sdk
                                       ┌──────┴───────┐
                                       │  Claude Code  │  (uses your existing
                                       │   agents      │   Claude Code auth)
                                       └───────────────┘
```

**Key modules**
- `lib/discovery.ts` — discover projects via the SDK's `listSessions()` (grouped by cwd), decode/verify paths, filter temp/scratchpad noise; also reads session transcripts via `getSessionMessages()`.
- `lib/docs.ts` — read/scaffold `DESIGN.md`, `PLAN.md`, `.protege/tasks.json`, `status.md`.
- `lib/assessment.ts` — the Project Assessment: prompt builder + reader for `.protege/assessment.json` (component map, architecture diagram, inferred plan, plan-drift).
- `lib/job-manager.ts` — **singleton** registry of live agents. Each `runJob()` calls the SDK `query()`, buffers streamed messages, tracks status (`starting|running|done|error|stopped`), usage, and session id. Exposes an async event stream per job for SSE.
- `lib/store.ts` — SQLite (better-sqlite3) for registered projects and job history/metadata.

**Live streaming**: `GET /api/agents/:id/stream` is Server-Sent Events. The client subscribes and renders the rolling context (assistant text, tool calls, status, token count) as it arrives.

## 6. Data model (SQLite)

```
projects(id, path, name, source['discovered'|'registered'], tags, created_at, last_seen)
jobs(id, project_id, prompt, status, session_id, model, cwd,
     started_at, ended_at, input_tokens, output_tokens, cost_usd, error)
job_events(id, job_id, seq, ts, type, payload_json)   -- append-only stream log
```

## 7. Key screens

1. **Dashboard** — grid of project cards: name, path, last activity, open task counts (todo/doing/done), live-agent badge. Filter/sort; "Add project."
2. **Project detail** — tabs: **Overview** (status.md + quick stats), **Design**, **Plan**, **Tasks** (kanban), **Sessions** (transcript history), **Run** (launch a job with templates). Header shows any live agents for this project.
3. **Agents** — all live + recent agents across projects: status, elapsed, tokens/cost, streaming context preview, Stop. Click through to full stream.

## 8. Job launch flow

1. Pick project → **Run** tab → choose a template (Plan, Build task, Update CLAUDE.md, Freeform) → edit prompt → Launch.
2. Server creates a `job` row, calls `JobManager.runJob({cwd, prompt, model, permissionMode})`.
3. SDK `query()` streams messages; JobManager records events, updates status/usage, captures `session_id`.
4. UI subscribes via SSE, shows live context. On completion, job becomes a session; task board / status can be refreshed.

**Permissions**: v0.1 runs jobs in a bounded permission mode with an allow-list, surfaced in the UI. No blanket auto-approve of destructive actions. (Exact SDK options pinned once the SDK-details research returns.)

## 9. Security & safety

- Localhost bind only; no external exposure.
- Jobs run with your existing Claude Code identity — treat launching a job as running Claude Code yourself.
- Path allow-listing: you can only launch jobs in registered project folders.
- Every job is logged (prompt + event stream) for audit/replay.

## 10. Roadmap

- **v0.1 (now):** discovery, project detail (docs/plan/tasks/sessions), launch one job, live stream, agents panel, stop.
- **v0.2:** resume sessions, task-board editing writes back to `tasks.json`, auto-generate `status.md`, CLAUDE.md scaffolder.
- **v0.3:** git-worktree isolation for parallel agents; diff/PR preview per job.
- **v0.4:** job templates library, cost budgets/alerts, scheduled jobs.

## 11. Open questions

- Task board: our own `tasks.json` vs. reading `TODO.md` conventions vs. both.
- Permission model for autonomous runs — how much to allow without prompting.
- Should Protégé ever write to `CLAUDE.md` automatically, or always propose a diff first? (Leaning: propose.)
