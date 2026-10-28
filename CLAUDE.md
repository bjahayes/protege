# Protégé

Mission control for large Claude Code projects: a Next.js web UI that discovers projects,
shows their status/docs/plans/tasks, and launches & monitors multiple Claude Code agents
via the Claude Agent SDK.

## Build & run
- Install: `npm install`
- Use: `npm run build` then `npm start` → http://127.0.0.1:4317 (previews on 4318). Pages load in ~0.02 s.
- Dev: `npm run dev` shows code changes live but compiles each page on first visit (0.7–8 s); only for
  changing Protégé. Always start through the npm scripts (`scripts/serve.mjs`): they create the
  per-install access key the request checks need. `.claude/launch.json`: `protege` = release, `protege-dev` = dev.
- **If you are running inside Protégé** (a chat or task Protégé started in this folder), Protégé's server is
  your parent process: stopping or restarting it, or building into `.next` while it runs, ends your run partway
  through. Never stop that server or a node process you didn't start, and never run `npm run build` while it's
  running. To try a change in a browser, build and run a separate copy:
  `PROTEGE_DIST_DIR=.next-test npx next build`, then in the background
  `PROTEGE_DIST_DIR=.next-test node scripts/serve.mjs next start -H 127.0.0.1 -p 4327` (previews on 4328); stop it
  when done. When the real server needs a restart to pick up a change, say so and let the person restart it.
- Typecheck: `npx tsc --noEmit`
- Tests (no model calls): `npm test` (arrow layout + Keep on a throwaway repo)
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
  - `starter.ts` / `starter-steps.ts` — projects made in Start something new keep `.protege/starter.json`
    (template, description, the shaping run, when first tried). `starterProgress()` (client-safe) works out the
    five getting-started steps from it and the project's jobs; `GettingStarted.tsx` shows them on the project page.
- `src/components/simple/**` — Protégé's live views: `SimpleTask` (conversation + track + review + reply),
  `Conversation`, `BuildTrack`, `PartsMap`, `LiveStrip`, `PartsBar`.
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
