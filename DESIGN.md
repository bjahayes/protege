# Protégé — Design Doc

> Mission control for Claude Code projects, with a plain-English front door for people who build tools
> without being programmers (lawyers, first of all). See where every project is, what's built and what's
> left; run Claude Code on it safely; and follow and understand what it does.

Status: **MVP, in daily use**  ·  Last updated: 2026-10-29

---

## 1. Problem

Claude Code is excellent at a well-scoped request. On work that runs for days or weeks, and for people
who can't read the code, the hard part is everything around the request:

- **Where is this up to?** What's designed, what's built, what's in progress, what's left.
- **What did the AI just do, and is it right?** Which parts it changed, in what steps, and whether the
  result works, without reading a diff.
- **Too many moving parts.** Several conversations, tasks and agents across several projects.
- **Fear of breaking things.** A change has to be safe to try and easy to take back.
- **Best practices don't stick.** Design docs, plans, checklists and CLAUDE.md drift out of date.

## 2. Goals / non-goals

**Goals**
- Discover every Claude Code project on the computer, and let any folder be added.
- Two views of one app: a **full view** (mission control) and a **Simple view** (plain English, for
  non-programmers) that shows the same work gently.
- Run Claude Code on a project (tasks, named agents, a full chat page) with the person's own sign-in, on a
  **safe copy** they keep or throw away, with undo afterwards.
- Show work as it happens and afterwards: a context panel beside every task and chat (the plan on the
  project's parts map, a live to-do list, the run as a replay strip, what changed in numbered steps, the
  app before and after), and a full history of every turn.
- Keep the project's documents current with agents, and keep every version of every document.

**Non-goals**
- Not a Claude Code replacement or an IDE: the Code page is Claude Code, run by Protégé.
- No cloud or multiple users: one person, on their own computer, `localhost` only.
- Not a legal-work agent: the domain stays building software; only the experience is gentler.

## 3. Core concepts

| Concept | What it is |
|---|---|
| **Project** | A folder Claude Code has worked in (found from its saved sessions and `~/.claude.json`) or one added by hand. Safe copies, temp folders and demo copies are filtered out (`config.ts` noise filter). |
| **Session** | A saved Claude Code conversation (from any app: terminal, IDE, Claude desktop, Protégé). |
| **Turn** | One request and the work that answered it, inside a session. A message sent while Claude works joins its turn. |
| **Job** | A run Protégé starts: a Simple-view task, an agent run, a reply that carries one on. Its events are kept. |
| **Agent** | A named, versioned job definition: what it does, what it may change (`document`, `report`, `plan` or `change`). |
| **Safe copy** | A git worktree a change is made in, kept or thrown away as a whole. |
| **Notes** | Protégé's own files in `.protege/` (checklist, map, summary, versions), outside git. |

## 4. Best practices, baked in

```
<project>/
  CLAUDE.md          # durable memory: architecture, conventions, gotchas
  DESIGN.md          # what we're building and why
  PLAN.md            # phased plan; checkboxes for milestones
  .protege/          # Protégé's notes (in .git/info/exclude, never committed)
    tasks.json       # the checklist: todo / doing / done
    assessment.json  # the project's parts, their status and how they connect (the parts map)
    plain-summary.md # what the project is, in plain English
    versions/<doc>/  # every version of every document, with who made it
```

1. **Plan before build.** "Show me the plan first" (Simple view) and Plan mode (Code page) draw the plan
   on the parts map before anything changes.
2. **Safe by default.** In a git project every change is made on a safe copy; nothing reaches the project
   until Keep; Keep can be undone.
3. **Show, don't tell.** What changed is told as steps on the map, not as a file list; the app can be
   seen working before and after.
4. **Documents stay current.** Built-in agents update the plan, design, notes, guide and change log; each
   change is a new version, and nothing is lost on restore.
5. **Plain English throughout**, with an option for Simplified Technical English (ASD-STE100).

## 5. Architecture

One Next.js (App Router, TypeScript) app on `127.0.0.1:4317`; one Node process, so singletons on
`globalThis` own live jobs and chats. Previews are served by a second small server on the next port.

```
┌──────────────────────────────── Browser (React) ────────────────────────────────┐
│ Simple view (tasks, panel)  │  Full view: projects, Code page, agents, history  │
└───────▲───────────────────────────────▲────────────────────────────▲────────────┘
        │ apiFetch (JSON, access key)   │ SSE: jobs and chats        │ iframe (keyed address)
┌───────┴───────────────────────────────┴───────────────────┐  ┌─────┴──────────────┐
│ Next.js server (middleware checks every request)          │  │ preview server     │
│  discovery · docs · doc-versions · assessment · agents    │  │ :4318, read-only,  │
│  JobManager (tasks, agents)  ·  ChatManager (Code page)   │  │ one project per    │
│  git (safe copies, Keep, undo) · stories · summaries      │  │ keyed address      │
│  store (SQLite)                                           │  └────────────────────┘
└──────────────────────────▲────────────────────────────────┘
                           │ engine.ts: the person's own `claude` (headless) / Agent SDK
                     ┌─────┴───────┐
                     │ Claude Code │  (the person's sign-in; never an API key)
                     └─────────────┘
```

**Key modules** (all in `src/lib/`; CLAUDE.md has the full list)
- `engine.ts` — the only place Claude runs: the installed `claude -p` by default, always with an explicit
  permission mode; refuses a run that would bill an API key. Also sign-in (out of sight, falling back to a
  window).
- `job-manager.ts` — live jobs: launch, stream, persist events, stop, follow-ups (auto-continue,
  auto-fix), the safe copy's commit and checks, and what a restart must wait for.
- `chat-manager.ts` — one live Claude Code process per Code-page conversation, with approvals.
- `git.ts` / `git-bin.ts` — safe copies (`~/.protege/safe-copies`), their shared `node_modules`, Keep (only
  notes the task changed are copied back; the checklist is merged), undo, and which git to run.
- `doc-versions.ts` — versions of every document; restoring saves the current text first.
- `change-story.ts`, `turn-summaries.ts`, `todo-plain.ts`, `request-steps.ts`, `plan-parts.ts` — small Haiku
  calls (no thinking) that put work into plain words; each result is kept, keyed by its inputs and style.
- `preview.ts`, `preview-server.ts`, `preview-key.ts` — previews.

## 6. Data model

SQLite (`data/protege.db`):
```
projects(path, name, source, tags, created_at, last_seen)
jobs(id, project_path, project_name, prompt, status, kind['run'|'assess'|'plan'], session_id, model,
     started_at, ended_at, tokens, cost, worktree_state, worktree_path, branch, base_ref,
     parent_job_id, agent_id, agent_name, agent_version, checks …)
job_events(job_id, seq, ts, type, payload)   -- every event, saved as it happens
agents, agent_versions                       -- agents people make; every save a new version
```
**Retention:** a job's events are kept in full for 90 days, then its bulky events (tool output, thinking,
status) go; after a year its events go entirely (`store.ts` `pruneEvents`, at start-up and daily).
Other kept results live in `data/`: `stories/`, `plans/`, `turn-summaries.json`, `todo-plain.json`,
`request-steps.json`, `settings.json`.

## 7. Key screens

- **Simple view** — project cards; Start something new (templates); Do a task; Ask a question; a project
  page with its summary, parts map and history; a task view: the conversation beside the context panel.
- **Code page** — every saved Claude Code session, carried on with Claude Code itself; the context panel
  beside it, with a turn picker for earlier turns.
- **Project page (full view)** — Overview (Documents, Architecture, Flowchart, Agent runs), Map, Brain,
  Design, Plan, Tasks, **History** (every turn, full page), Sessions, Run.
- **Agents**, **Live**, **Inbox** (what needs you now), **Usage**.

## 8. How a change runs

1. A task starts (Simple view, an agent, a reply). In a git project Protégé makes a safe copy, links its
   `node_modules`, and copies the notes in (recording what each looked like).
2. Claude Code runs headless in the safe copy with Protégé's briefing appended to its own system prompt.
   Events stream to the browser and are saved.
3. When Claude finishes, the safe copy is committed and the project's checks run (auto-fix up to twice).
   Until that's done, a restart waits.
4. The person sees what changed (steps on the map, the app before and after) and chooses Keep or Throw
   away. Keep merges the branch and copies back only the notes the task changed, merging the checklist.
5. A kept change can be undone (a revert).

**Permissions:** tasks run with `acceptEdits` in their safe copy; document and report agents run with
`dontAsk` and may edit only their one file; plan runs may only read. The mode is always passed
explicitly, so the person's own default never widens it.

## 9. Security & safety

- **Only this computer, only Protégé's pages:** the middleware checks the host, `Sec-Fetch-Site`, origin,
  JSON bodies and a per-install access key (cookie or header) on every request.
- **Known projects only:** routes turn ids into folders only through `projectDir`.
- **Previews:** served from their own origin, read-only, at an address keyed to one project (or one safe
  copy), so a previewed page can't reach another project's files. Hidden files and folders (`.env`, `.git`,
  `.protege`…), key and certificate files and `node_modules` are never served, nor is a home folder or a
  drive.
- **Sign-in:** Claude Code's own; Protégé strips API keys from its environment and stops a run that would
  use one.
- Every job is logged (prompt and events) for review and replay.

## 10. Roadmap

See PLAN.md. Next: previews for projects that need a dev server; the Simple view's History; larger type
and an accessibility pass.

## 11. Open questions

- Should the turn history include Simple-view tasks and agent runs, which aren't sessions in the folder?
- Headless runs rarely keep their own to-do list; is Protégé's list from the request good enough, or should
  runs be made interactive?
