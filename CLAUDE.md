# Protégé

Mission control for large Claude Code projects: a Next.js web UI that discovers projects,
shows their status/docs/plans/tasks, and launches & monitors multiple Claude Code agents
via the Claude Agent SDK.

## Build & run
- Install: `npm install`
- Use: `npm run build` then `npm start` → http://127.0.0.1:4317 (previews on 4318). Pages load in ~0.02 s.
  `npm start` looks after the server: `npm run restart` (or **Load latest version**) reloads it on new code
  without cutting off sessions; builds alternate between `.next` and `.next-alt` (`data/active-build-<port>`).
- Dev: `npm run dev` shows code changes live but compiles each page on first visit (0.7–8 s); only for
  changing Protégé. Always start through the npm scripts (`scripts/serve.mjs`): they create the
  per-install access key the request checks need. `.claude/launch.json`: `protege` = release, `protege-dev` = dev.
- **If you are running inside Protégé** (a chat or task Protégé started in this folder), Protégé's server is
  your parent process: stopping or restarting it, or building into `.next` while it runs, ends your run partway
  through. Never stop that server or a node process you didn't start, and never run `npm run build` while it's
  running. To try a change in a browser, build and run a separate copy:
  `PROTEGE_DIST_DIR=.next-test npx next build`, then in the background
  `PROTEGE_DIST_DIR=.next-test node scripts/serve.mjs next start -H 127.0.0.1 -p 4327` (previews on 4328); stop it
  when done, delete `.next-test`, and put back `tsconfig.json` (the build adds `.next-test/types` to it). To make the running Protégé load your change, run `npm run restart`: it builds the new version while the old one keeps serving, waits until no session or task is mid-turn (yours finishes its reply first), then restarts on it. Sessions carry on from their saved history. The person can do the same with **Load latest version** in the sidebar.
- Typecheck: `npx tsc --noEmit`
- Tests (no model calls): `npm test` (arrow layout + Keep on a throwaway repo + the context panel's replay, plan and steps)
- Build: `npm run build`

## Stack
- Next.js 15 (App Router, TypeScript), Tailwind, better-sqlite3, react-markdown.
- `@anthropic-ai/claude-agent-sdk` (v0.3.x) — uses the local Claude Code login (OAuth),
  no ANTHROPIC_API_KEY required. `apiKeySource: 'none'` in the init message confirms this.

## Architecture
- Security: `src/middleware.ts` checks every request (Host is 127.0.0.1/localhost, Sec-Fetch-Site
  same-origin, JSON for non-GET, Origin, per-install key from a cookie or `X-Protege-Token`). Pages call
  the API only through `apiFetch` (`src/lib/api-client.ts`). Routes turn project ids into folders only
  through `projectDir` (`src/lib/project-guard.ts`, known projects only). Previews come from
  `src/lib/preview-server.ts` on their own port, started in `src/instrumentation.ts`.
- Git: `src/lib/git.ts`. Protégé's notes (`.protege/`) are in `.git/info/exclude`
  and copied into and back out of safe copies; direct runs save the files they changed; Keep offers
  "save them first" when the project has unsaved changes.
- `src/lib/` — server-only modules:
  - `config.ts` — paths, `projectIdFromPath`/`pathFromProjectId` (base64url of the abs path),
    noise filter for temp/scratchpad cwds. **Uses Node `Buffer` — never import in a client component.**
  - `store.ts` — SQLite singleton (stashed on `globalThis` to survive HMR). Tables: projects, jobs, job_events.
  - `discovery.ts` — `discoverProjects()` groups `listSessions()` by cwd; merges registered projects.
  - `docs.ts` — read/scaffold DESIGN.md, PLAN.md, CLAUDE.md, `.protege/tasks.json`, `status.md`.
  - `job-manager.ts` — **singleton on `globalThis`**. `launch()` runs SDK `query()`, streams SDKMessages,
    persists events, supports abort via `AbortController`. Concurrent jobs supported.
  - `format.ts` — client-safe formatting helpers (no Node imports).
  - `engine.ts` — **the only place that runs Claude.** Import `query` from `@/lib/engine`, never from the SDK.
    Default engine runs the person's installed `claude` headlessly (`-p --output-format stream-json`, window hidden),
    so tasks use their own Claude plan login. `PROTEGE_ENGINE=sdk` switches back to the Agent SDK.
    Strips ANTHROPIC_API_KEY/ANTHROPIC_AUTH_TOKEN and stops a run whose init `apiKeySource` isn't `none`/`oauth`
    unless `PROTEGE_ALLOW_API_KEY=1`. `PROTEGE_CLAUDE_PATH` overrides where `claude` is found.
  - `live-build.ts` — client-safe: stages, plain step labels, touched files, parts-map layout and edges.
  - `agents.ts` (client-safe) — the built-in agents: each has instructions, a kind (`document` keeps one file,
    `report` writes `.protege/reports/<id>.md`, `plan` only reads, `change` edits on a safe copy) and a version.
    `agent-store.ts` keeps the agents people make (every save a new version, in `agent_versions`).
    `agent-run.ts` runs one: document and report agents get `permissionMode: "default"` with only Read/Glob/Grep
    and Edit/Write of their one file allowed, and Bash disallowed, so the limit holds whatever the person's
    settings allow. Every run records `agentId`/`agentName`/`agentVersion` on its job.
  - `doc-versions.ts` — every version of every project document, whoever changed it, in `.protege/versions/<file>/`.
    `ensureVersioned()` runs whenever Protégé reads a document (the project API does it for all of them): the first
    time it imports the document's git history, then any change since the last version becomes a new one. While an
    agent works on a document the check waits, so the agent's run is credited. Text differing only in line endings
    is the same version. `DocVersions.tsx` shows them (Overview Documents list, Design and Plan tabs).
  - `starter.ts` / `starter-steps.ts` — projects made in Start something new keep `.protege/starter.json`
    (template, description, the shaping run, when first tried). `starterProgress()` (client-safe) works out the
    five getting-started steps from it and the project's jobs; `GettingStarted.tsx` shows them on the project page.
- `src/components/simple/**` — Protégé's live views: `SimpleTask` (conversation + track + review + reply),
  `Conversation`, `ContextPanel`, `ReplayStrip`, `PartsMap`, `LiveStrip`, `PartsBar`.
- `src/app/api/**` — route handlers (all `runtime = "nodejs"`, `dynamic = "force-dynamic"`).
- `src/app/**` — client pages; `src/components/**` — client components.

## Conventions / gotchas
- Client components must NOT import `config.ts` (Node `Buffer`). The `Job` type already carries
  `projectId`, so use that in the UI instead of recomputing it.
- Live agent output streams to the browser via SSE at `/api/jobs/:id/stream`; the endpoint
  replays the persisted event backlog first, then live events, then `end`.
- SDK message handling lives in `JobManager.handle()`. Token/cost come from the `result` message:
  `total_cost_usd`, and per-model `modelUsage[*].inputTokens/outputTokens` (camelCase).
- Data lives in `data/protege.db` (gitignored). Delete it to reset registered projects/history.
- `scripts/smoke-sdk.mjs` is a quick SDK sanity check (`node scripts/smoke-sdk.mjs`).

## Verified SDK facts (v0.3.234)
- `query({prompt, options})` returns an async generator of `SDKMessage`; `options.abortController` cancels.
- `listSessions()` → `{sessionId, cwd, summary, firstPrompt, lastModified, createdAt, gitBranch, fileSize}`.
- `getSessionMessages(id, {dir})`, `getSubagentMessages`, `forkSession`, `renameSession` all exist.
- PermissionMode: `default | acceptEdits | bypassPermissions | plan | dontAsk | auto`. `plan` is read-only.

## Learnings
- **2026-08-20:** Project has evolved beyond PLAN.md — an Assessment subsystem (`.protege/assessment.json`) exists with full schema that wasn't in the original roadmap. Keep PLAN.md in sync as new subsystems emerge.
- **2026-08-20:** `.protege/` is a metadata store for machine-readable outputs; schema enums (`status: solid|partial|stub|broken|unknown`, `phase: idea|prototype|mvp|beta|production`) must be exact for tooling to parse correctly.
- **2026-08-20:** Project is MVP phase (~58% complete): all Phase 0 prototype goals are solid, but Phase 1+ roadmap, tests, restart-recovery, and path allow-listing remain unbuilt.
- **2026-10-28:** Simple view shows work like Claude desktop: a live conversation per task, follow-up replies
  (`continueFrom` on POST /api/jobs resumes the session and reuses the safe copy), a 5-stage track, and a parts map
  from `assessment.json`. Tool events now carry a structured `detail` (file, command, line counts).
- **2026-10-28:** Chat page (`/chat`): one live Claude Code process per conversation (`chat-manager.ts`, SDK
  `query()` with streaming input, `canUseTool` for approvals, `pathToClaudeCodeExecutable` = the person's
  `claude`). History comes from the saved session file; live events dedupe against it by message uuid.
  Model list comes from Claude Code itself (`supportedModels()` on a silent process, no model call).
- **2026-10-28:** `engineEnv()` strips `CLAUDECODE`, `CLAUDE_PID`, `CLAUDE_CODE_*` and `CLAUDE_AGENT_SDK_*`:
  when Protégé is started from inside a Claude Code session those make the child `claude` expect a host
  to refresh its login ("OAuth session expired and could not be refreshed").
- **2026-10-28:** globalThis singletons keep the old class after a hot reload; `getChatManager()` re-points
  the kept instance's prototype so new methods appear without dropping live chats. Do the same for any new
  singleton.
- **2026-10-28:** Parts diagram arrows are routed by `wire-route.ts` (right-angled, only through gaps, one
  lane each; gaps grow to fit). `checkWires()` counts arrows crossing cards or each other and labels hiding
  arrows; the diagram writes the count to `data-wire-faults`. Keep it at 0 on every project and width.
- **2026-10-29:** The Simple task view is a conversation plus a context panel (`ContextPanel`): plan on the map,
  replay strip, what changed in numbered steps, Before / After. Server pieces: `lib/change-story.ts` (Haiku,
  `MAX_THINKING_TOKENS=0`: with thinking on the same grouping took ~30 s, not ~5), `GET /api/jobs/:id/story`
  (`?quick=1` = grouping only), preview server `/_job/<id>/` (a safe copy waiting for Keep), `kind: "plan"`
  runs (`planFirst` on POST /api/jobs). Pure parts in `lib/replay.ts`, `lib/plan.ts`, `lib/story-steps.ts`,
  tested by `npm run test:panel`.
- **2026-10-29:** Git work on one safe copy is serialised (`onePerCopy` in `git.ts`). Concurrent `git add`
  from a diff read and the end-of-run commit hit the index lock: the commit silently failed (Keep would merge
  without the change). `test:keep` checks it.
- **2026-10-29:** The `result` event's text is whitespace-squashed (`summarize`); never compare it to a `text`
  event directly or show it as-is when the reply already showed.
- **2026-10-29:** The Code page has the same context panel (`components/chat/ChatPanel.tsx` →
  `ContextPanel` with `who="Claude"`, `flush`). `ChatItem`s carry `ts` (saved transcript `timestamp`, or
  stamped in `chat-manager.emitItems`). Chat stories come from Claude's edits (`storyFiles` in
  `lib/chat-panel.ts`) via `POST /api/chat/story`; Plan-mode plans via `POST /api/chat/plan-parts`.
- **2026-10-29:** Simple task updates are batched with `requestAnimationFrame`, which doesn't fire in a hidden
  tab or browser pane: a test that reads the page while it's hidden sees "Getting started" until it's shown.
- **2026-10-29:** Layout is checked by measurement, not by eye: with a test copy running on 4327,
  `node scripts/ui-sweep.mjs` opens every page at 1440, 1024 and 390 px wide, screenshots each into
  `data/ui-sweep/`, and counts sideways scrolling, text spilling out of its box, controls drawn over each other,
  text under 11 px and parts-diagram arrow faults (it also opens each page's "What's happening" side).
  `node scripts/test-resize.mjs <base> <session id>` drags the side-panel edges. Only the floating Help button
  should show up (it floats over scrolling content on purpose). Run both after any layout change.
- **2026-10-29:** Side panels resize through `components/Resizer.tsx` (`usePanelWidth` + `ResizeHandle`: drag,
  double-click to reset, arrow keys, width remembered per panel). Below 768 px the sidebar is a ☰ menu and
  the Code page's list and panels open full-width over the chat. Never use text below 11 px.
- **2026-10-29:** Run titles go through `runTitle()` (agents.ts) and project-card lines skip sessions that
  `isProtegePrompt()` recognises, so Protégé's long instructions to Claude never show as a title.
- **2026-10-29:** Explanations can be written in Simplified Technical English (ASD-STE100): `lib/explain-style.ts`
  (`data/settings.json`, `GET/POST /api/settings`, the "Explanations" switch in both sidebars). Every prompt whose
  words the person reads appends `explainRules()` (`{ json: true }` for prompts that answer in JSON, or the
  model drops the format). Cached stories and plans are keyed by the style.
- **2026-10-29:** This shell sets `NODE_ENV=production`, so a bare `npm install` drops the dev packages
  (TypeScript, Tailwind). Use `npm install --include=dev`.
- **2026-10-29:** `npm run restart` waits for every session mid-turn, including the one that ran it: never poll
  for the swap from inside a Protégé session (it waits for you while you wait for it). Run it as the last
  step and end the turn, or use `npm run restart -- --force` / **Restart now**, which stops what's mid-turn.
- **2026-10-29:** Code-page turns (`turnStarts` in `lib/chat-panel.ts`): a new turn starts at a message after a
  `result` or after Claude's reply text; a message sent while Claude works is marked `midTurn` by
  `chat-manager.send` and joins the turn. Saved transcripts have no `result` items. The panel's turn picker
  shows any earlier turn's own picture.
- **2026-10-29:** Project Overview has sub-tabs (Documents, Architecture, Flowchart, Agent runs), remembered in
  `protege.overview.tab`.
- **2026-10-29:** Turn summaries ("Built the replay strip") come from `lib/turn-summaries.ts` (Haiku, 25 turns a
  call, `data/turn-summaries.json` keyed `v3:<style>:<turn key>`; bump the version to rewrite them all).
  `lib/turn-digest.ts` (client-safe) describes a turn; `POST /api/turn-summaries` writes missing ones. The
  project's **History** tab (`components/TurnHistory.tsx`, `GET /api/projects/:id/turns`) lists every turn of every
  saved session in the folder, newest first; a session carried on as a copy repeats its early turns, so turns are
  de-duplicated by key and start time. `?tab=history` opens it.
- **2026-10-29:** Inbox items older than a week are marked `older` (folded away, not in the badge); reviews whose
  safe copy is gone are dropped; Code-page sessions waiting for approval are listed (`chat:<id>`).
- **2026-10-29:** The "What's happening" panel shows a live to-do list (`components/simple/TodoList.tsx`): Claude
  Code's own (TaskCreate/TaskUpdate or TodoWrite, read by `lib/todo-list.ts`; job events carry them in `detail`),
  reworded plainly by `lib/todo-plain.ts`; or, when Claude keeps none (headless runs usually don't, even when asked),
  the request split into steps and ticked off by `lib/request-steps.ts` from what Claude adds and says, at most
  every 10 s (`useRequestTodos`; never cancel a check in flight, or busy work starves it). Edit events carry
  `detail.preview`, the lines an edit really adds.
- **2026-10-29:** Job runs append Protégé's briefing to Claude Code's system prompt
  (`{ type: "preset", preset: "claude_code", append }`). A plain string `systemPrompt` replaces Claude Code's own
  instructions entirely; it did for every task and agent run until this date.
