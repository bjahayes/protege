# Protégé — Plan

## Phase 0 — Prototype ✅ (done)
- [x] Verify Agent SDK API surface (query, listSessions, getSessionMessages, abort)
- [x] Next.js scaffold + Tailwind + SQLite store
- [x] Project discovery from `~/.claude/projects` (noise-filtered) + manual register
- [x] Project detail: Overview, Design, Plan, Tasks, Sessions, Run
- [x] Job manager: launch, stream, persist, stop; concurrent agents
- [x] Live agent view over SSE; Agents cross-project panel
- [x] Task board writing `.protege/tasks.json`
- [x] Doc scaffolder (DESIGN/PLAN/CLAUDE/tasks)

## Phase 1 — Understand a project you've lost track of ✅ (core done)
- [x] **Project Assessment** — agent reads the repo and writes `.protege/assessment.json`
- [x] Visual **Map** tab: architecture diagram (Mermaid), component cards (what/does/status/issues), completeness
- [x] **Inferred plan** for projects with no PLAN.md + one-click "Adopt as PLAN.md"
- [x] **Plan-drift detection** — assessment checks whether PLAN.md still matches the code
- [x] Mermaid rendering + syntax highlighting across all docs
- [x] **Repo-map** — instant "Code map" on the Map tab: import-graph PageRank ranks the most central
      files, with per-file symbols. Dependency-light (regex extractors for ts/js/py/go/rust). Free, no agent.
- [x] **Brainchild integration** — reads the existing brainchild "second brain"
      (`~/brainchild/data/brain`, markdown+frontmatter). Two surfaces: a per-project **Brain tab**
      (matched page + its techniques), and a top-level **Brain explorer** (sidebar item `/brain`) —
      searchable browse of all 351 notes + 30 project pages with cross-links. Reuse, not rebuild.
- [x] **"Ask this project"** — a proper streaming **chat assistant** (not a textbox): read-only Claude
      Code session resumed per turn, pre-loaded with repo-map + assessment + brain notes so it's grounded
      and instant; token streaming, tool activity ("reading X"), multi-turn, starter prompts. `Ask` tab.
- [ ] Repo-map: tree-sitter upgrade (symbol-level PageRank) + feed it into agent/assessment context
- [ ] "Ask" across the whole brain / all projects (global chat), and cite-back links to files/notes

## Phase 2 — Make it daily-drivable
- [x] Resume/continue a session from the UI (SDK `resume`) — "Continue" on sessions, "Resume" on jobs
- [x] **Session resilience** — auto-continue a run that hits max-turns/budget (resumes same session,
      reuses worktree, up to 3×, tracked as a parent→child chain); Run-tab toggle
- [x] Persist live-agent state across restart (reconcile orphans → `interrupted`; event log in SQLite)
- [x] Rich Sessions transcript — full text, thinking/tool blocks, load-older, "active" badge
      (fixed: SDK `getSessionMessages` returns 0 for Windows-backslash `dir`; normalize + fall back)
- [x] "Needs you" notifications via service worker → OS notification on done/error/needs-input,
      click deep-links to `/agents?job=<id>`. Toggle in the sidebar.
- [x] Marked-up session transcripts — per-message category (Needs you / Your input / AI analysis /
      Thinking / Action / Result / Error) with a colored legend + click-to-filter. Thinking (silent
      reasoning) is distinct from AI analysis (what the AI tells you) and hidden by default.
      Text renders VERBATIM (React-escaped) so nothing with angle brackets/code is dropped, and real
      URLs are linkified. (Earlier markdown renderer silently swallowed `<…>` content — replaced.)
- [ ] Treat `error_max_turns` as "paused / resumable", not a failure
- [ ] Auto-generate `.protege/status.md` on job completion
- [x] Live auto-update of the session transcript (polls + appends new messages while active,
      Live/Paused toggle, auto-scroll-to-bottom)
- [x] Dedicated **Live** page (sidebar item + live count badge) — grid of active agents across all
      projects, each with a **rolling live-activity feed** (what it's doing right now: tools/thinking/text),
      elapsed/tokens/cost, Stop, Stop-all, open-full-stream; plus active external Claude Code sessions
- [x] **Agents page kept live** — 3s poll + 1s tick, live agents first with their latest action, and an
      "auto-refreshing" indicator; the live payload carries a recent-activity feed (`recentEvents`)
- [x] **Agents filters** — filter the runs list by project and by status (Live/Done/Error/Stopped/Interrupted)
- [ ] Job permalink page (`/jobs/[id]`) with full transcript + trajectory timeline
- [ ] Context-window % per live agent (a key "when to intervene" signal)
- [ ] True push (VAPID) so notifications fire with all tabs closed (today: needs one tab open)
- [ ] Per-project settings: default model, permission mode, allowed tools
- [ ] Prune/retain `job_events` (unbounded today)

## Phase 3 — Parallelism with isolation & review
- [ ] Git-worktree isolation per agent (one worktree = one branch = one agent)
- [ ] Per-job diff review with syntax highlighting; stage/discard; merge gate
- [ ] Inline diff comments that round-trip to the agent (Conductor-style)
- [ ] Live permission prompts surfaced in UI (`canUseTool`) — approve/deny per action
- [ ] Real-time steering: inject guidance mid-run without stopping (Copilot Mission Control-style)

## Phase 4 — Scale & ergonomics
- [x] **Cost & usage dashboard** (`/costs`) — total spend/tokens + breakdown by project / kind / model
- [x] **Stop-all kill switch** on the Live page (halt every running agent at once)
- [x] **Loop / stuck-agent detection** — flags an agent repeating the same action; badge + notification
- [x] **Command palette (⌘K/Ctrl-K)** — jump to any project or page; global search
- [x] **Keyboard shortcuts** — G-chord nav (G→D/L/A/C), `?` cheat-sheet
- [x] **Active-session surfacing** on the Live page — shows interactive Claude Code sessions
      (terminal/IDE) that Protégé didn't launch, so all live activity is visible in one place
- [x] **Continuous missions** — "Run as a mission" on the Tasks tab dispatches an agent per to-do
      task in turn, marking each done as it goes (MissionManager; sequential; optional per-task worktree)
- [x] **Inbox** — sidebar view (with badge) of runs that need you: changes to review, failures, stuck agents
- [x] **Checkpoints** — snapshot/restore/export a project's docs+plan+tasks+assessment state
- [ ] Kanban where a card = an agent run; retry-a-task-with-a-different-model (vibe-kanban-style)
- [ ] Backlog.md-style markdown task files as the in-repo source of truth
- [ ] Cost budgets + alerts (`maxBudgetUsd` per project); daily standup digest
- [ ] Session/commit **timeline** + churn×complexity **hotspot** heatmap
- [ ] Search across all sessions and jobs
- [ ] (deliberately skipped from mission-control research) Field Ops / external-action layer —
      out of scope for a Claude Code command-center; heavy security surface

## Research notes (competitive landscape, Aug 2026)
Tools surveyed: Conductor, Claude Squad, Crystal→Nimbalyst, Sculptor, vibe-kanban,
Backlog.md, Cursor/Windsurf, Devin + DeepWiki, OpenHands, Copilot Mission Control.
- **Open niche:** plan/architecture/component understanding is weak across all orchestration
  tools — they delegate it to the agent. Protégé's Assessment/Map owns this gap.
- **Codebase-grasp artifacts, by ROI:** (1) Mermaid architecture diagram, (2) module dependency
  graph, (3) ranked repo-map (Aider tree-sitter + PageRank), (4) diff-on-map, (5) hotspot heatmap,
  (6) session timeline, (7) live plan checklist, (8) per-agent event-stream trajectory.
- **Drift detection patterns to adopt:** symbol/path existence checks (flag docs referencing
  deleted files/symbols), content-hash pinning of doc→files, git-timestamp divergence vs churn,
  regenerate-and-diff the assessment, task↔commit reconciliation.
- **Parallel-agent staples:** worktree-per-agent, per-agent status chips, "needs-you"
  notifications, diff-review-before-merge, context-window % metric.

## Protégé — the approachable mode (non-technical / lawyer-friendly) ✅
(**Protégé** is the name of both the tool and the assistant: the plain-English front door for lawyers
who build. All Simple-mode copy says "Protégé" (not "the assistant"), the sidebar reads "Protégé / Build things,
simply", new projects live in `~/Protégé Projects`, and the Ask/guide prompts self-identify as Protégé. The full
view is the power-user side of the same app.)
- [x] **Toggle** between the full "mission control" view and a plain-English **Simple view**
      (`AppShell` swaps sidebar/chrome by route; "Switch to Simple view" / "Switch to full view").
- [x] Simple sidebar: **My projects · Ask the assistant · How this works** (jargon-free).
- [x] **Simple Home** — friendly project cards (name, plain status, "active" pulse, "last worked on")
      + a big "Ask the assistant anything" call-to-action.
- [x] **Simple Ask** — the assistant, lawyer-framed, with a scope picker ("everything" or a project)
      and a "How should I ask?" tips panel.
- [x] **Simple project page** — "Where this is up to" (plain summary + "How far along" bar +
      "Things to watch"), two big actions (ask a question / make a change), plain-English recent activity.
- [x] **Guided task flow** — plain textarea + examples → runs safely (isolated + auto-verify + auto-fix),
      shows plain-language progress ("Reading through your files…"), then a friendly review
      ("It changed N files — Keep these changes / Throw them away"). `SimpleRun`, `lib/plain.ts`.
- [x] **Visual "How this works"** — an illustrated step-by-step of what the assistant does.
- [x] **Plain-English summary generator** — an agent writes a jargon-free `.protege/plain-summary.md`
      (verified: zero jargon even for a technical project, uses analogies). Shown as "In plain English"
      on the Simple project page, replacing the technical assessment text. `lib/plain-summary.ts`.
- [x] **Straightforward "use Claude Code" entry point** — `/simple/do`: a 2-step guided flow
      (pick a project → describe the task in plain words) that runs it safely and shows a plain review.
      Prominent on the Simple Home and sidebar ("Do a task").
- [x] **Batch plain summaries** — generated jargon-free summaries for 17 real projects (haiku, 3-at-a-time);
      the excerpt shows on Simple cards (`plainSummaryLine` in discovery). `scripts/batch-plain-summaries.mjs`.
- [x] **Contextual task suggestions** — instead of a blank box, `/simple/do` shows 5 project-specific,
      plain-language ideas (a mix of do/ask, e.g. "Where are the design-around risks in these draft claims?")
      generated from the plain summary + tasks + assessment. `/api/projects/[id]/suggestions` (cached, haiku).
- [x] **Guide helper ("Clippy for Claude Code")** — a friendly, dismissible floating guide in Simple mode
      with contextual tips per page. `GuideHelper`.
- [x] **Trust & safety layer** — a persistent "Everything runs on your own computer" reassurance in the
      Simple shell, a "Common questions" FAQ on the help page, plain-English errors (`plainError`) with a
      "nothing was changed" note.
- [x] **Undo / plain history** — the project page's "History" lists what the assistant did in plain terms;
      applied changes get a one-click **Undo** (git-revert; `JobManager.undoJob` → `/api/jobs/[id]/undo`).
      Verified end-to-end (apply → undo removes it → state 'reverted' → double-undo refused).
- [x] **Building recipes + onboarding** — building-oriented (NOT legal-work) recipe chips on "Do a task"
      ("Add something new", "Fix a problem", "Make a small tool"…) + a first-run welcome card on the home.
- [x] **Show-its-work / sources** — the assistant ends answers with a "Where this comes from:" list of the
      files/sections it actually used, so answers are verifiable. Verified.
- [x] **Create a NEW project from a friendly template** — `/simple/new`: pick a starter (a little web
      tool, a document builder, a checklist, or blank), name it, optionally describe what you want. Scaffolds
      a real, working static-web project under `~/Protégé Projects/<slug>`, `git init`s it (so undo/isolation
      work), registers it, and — if a description is given — launches an agent to tailor it (shown via
      `SimpleRun`). `lib/templates.ts`, `/api/templates`, `/api/projects/create`. Verified end-to-end
      (template → git repo → agent edited the file → preview reflects it). Git resolver falls back to
      `C:\Program Files\Git\cmd\git.exe` when the server's PATH lacks git.
- [x] **Live preview / "See it working"** — `/simple/preview/[id]` renders the project's static site in a
      sandboxed iframe with a Computer/Phone device toggle, Refresh, and Open-in-new-tab; a "▶ See it working"
      button appears on the Simple project page whenever the project has a web entry. Files are served read-only
      from the project dir via `/api/preview/[id]/[[...path]]` (traversal-guarded, `.git`/`node_modules` blocked,
      no-store), with a `<base>` tag injected into HTML so relative resources resolve. `lib/preview.ts`;
      `previewEntry` added to the project-detail API. Verified (serves index, guards return 404, base injected).
- [x] **Interactive guide ("Clippy") with its own question box** — `GuideHelper` now has a textbox + suggested
      question chips; answers stream from `/api/guide` (haiku, tool-less, single-shot) via `buildGuideSystemPrompt`,
      which is told the current screen (per-route plain label) and demo state so answers are contextual to what's
      on screen. It answers how-to-use-the-app questions in plain English (points project-content questions to Ask).
      `lib/guide.ts`. Verified (streams; e.g. "click the Keep button to save it").
- [x] **Demo mode** — a simple sidebar toggle (`DemoToggle`, no banner) that swaps ALL real projects for
      three made-up, self-contained example projects (Client Intake, Clause Library, Deadline Tracker) so a new
      user can explore safely without seeing their real work. `lib/demo.ts` (server; each has a real previewable
      static site + plain summary + assessment + history + suggestions), `lib/demo-client.ts` (cookie `bw_demo`
      mirrored to localStorage; `isDemoId`). Wired into `/api/projects` (cookie-gated), `/api/projects/[id]`,
      `/api/projects/[id]/suggestions`, and `/api/projects/[id]` (cookie/id-gated).
      **Demo mode is REAL, not scripted:** demo projects materialize to git-backed folders on disk
      (`~/Protégé Projects/.demo/<id>`) on first use, so the **real agent genuinely codes changes** and the
      **live preview reflects them** — the point is getting people comfortable actually building. `/api/jobs`,
      `/api/projects/[id]/ask`, and `/api/preview/[id]` are all demo-aware (resolve via `materializeDemo`); a
      "↺ Reset this demo project" button (`/api/projects/[id]/reset`) restores the original. `.demo` is noise-filtered
      so demos never leak into the real list. Verified: a real job changed the `<h1>` in a demo's index.html and the
      preview showed it; reset restored it; real list (146) shows no demo leak.
- [x] **Grounded "how far along"** — the progress bar is no longer a fuzzy agent estimate; it's now `done / (done+remaining)`
      from a concrete list. The Simple project page shows **"What's left"** (each remaining item spelled out) + a collapsible
      **"Already done"** + a one-click "do the next one". Source: `progress` in the project-detail API — real projects derive it
      from the task board (todo/doing/done titles); demo projects carry explicit `done`/`whatsLeft`. If there's no checklist,
      it says so honestly instead of showing a percentage. `ProgressBlock` in the Simple project page; `ProjectProgress` type.
- [ ] Next: larger-type/accessibility pass; hide cost/tokens fully in Simple mode; filter project pickers to
      real (registered/recent) projects; preview for projects that need a dev server (not just static).

NOTE ON DIRECTION: keep this a code/tool-BUILDING harness (approachable Claude Code), NOT a legal-work
agent like Harvey. Simple mode is an approachable front door for lawyers who build tools — the domain
stays software; only the UX gets gentler.

## Backlog
- [ ] Multi-machine session mirroring via `SessionStore`
- [ ] Subagent drill-down (`getSubagentMessages`)
- [ ] Enforce path allow-listing for job launches (DESIGN promises it; not yet enforced)
- [ ] Export a project's status/assessment as a shareable report
