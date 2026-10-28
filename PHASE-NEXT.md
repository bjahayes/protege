# Protégé — Next Phase Plan (v0.2 → v0.3)

Synthesized from a 2026 SOTA scan of AI coding command centers (Antigravity, GitHub Agent HQ,
Cursor 3.x/Bugbot, Amp, Sculptor, Devin/DeepWiki, Warp Oz, Nimbalyst, OpenHands, Factory, Kiro,
Zed/ACP, Spec-Kit, and the agent-observability tools Braintrust/Langfuse/Latitude).

## Where the market moved (and where Protégé already leads)

2025 was **"run agents in parallel in worktrees."** Protégé already owns that (worktree isolation +
diff/apply/discard gate, missions, Live/Agents/Inbox, cost, loop-detection, notifications) **plus**
codebase-understanding (repo-map + deep assessment + Brain) that most orchestrators *lack*.

2026's frontier is four things Protégé does **not** yet have:

1. **Verification** — prove the output is correct (auto-tests, judge scores, evidence artifacts), not just show a diff.
2. **The outer loop** — issue → agent → *verified* PR, triggered by events, not just manual launches.
3. **Spec-driven work** — specs (with testable acceptance criteria) as the durable unit; code is regenerable.
4. **Compounding memory** — agent-written, feedback-derived knowledge that improves future runs.

Protégé already owns the **review gate** and **context assembly** (repo-map/assessment/Brain), which
are exactly the seams these bolt onto — so this is a leapfrog opportunity, not a catch-up.

## Prioritized backlog

Complexity: S ≈ hours–1 day · M ≈ 2–4 days · L ≈ 1–2 weeks.

### Tier 1 — compounding quick wins (front-load)
- [x] **Prime every launch with context** (S) — every run now injects a repo-map + assessment orientation
      as its system prompt (RunForm toggle, on by default; missions too), so agents start warm. `buildLaunchContext`.
- [x] **Oracle / second-opinion review** (S–M) — "🔎 Oracle review" in the diff-review gate: a fresh
      read-only agent critiques the diff for bugs/spec-drift/risks and posts findings. `/api/jobs/[id]/oracle`.
- [x] **Agent write-back memory** (S–M) — "📝 memory" on a completed run launches an agent that distils
      durable learnings into CLAUDE.md (`## Learnings`). Verified: appended dated bullets. `/api/jobs/[id]/memory`.

### Tier 2 — verification layer (the differentiator)
- [x] **Automated verification loop + auto-fix** (M) — "✓ Run checks" (on-demand) detects & runs the
      project's test/lint/build (npm/pytest/make/cargo/go). Plus **auto-fix**: a "Verify & auto-fix"
      RunForm toggle (isolated) auto-runs checks on completion and, on failure, spawns a bounded fix pass
      (≤2×) that resumes the session in the worktree and re-checks. Verified end-to-end (break test → fix → pass).
- [x] **Session eval scoring** (M) — "☆ rate run" LLM-judges a completed run (score/5 + verdict + reason)
      via a haiku judge. `/api/jobs/[id]/eval`. TODO next: persist scores + a regression set.
- [ ] **Verification artifacts** (M) — a run emits a reviewable bundle: what-changed summary + test output (+ screenshots/recording for UI work via a headless-browser MCP). The gate becomes an *evidence* gate. *Antigravity, Devin.*

### Tier 3 — spec & outer loop
- [ ] **Spec → plan → tasks with EARS criteria** (M) — a spec generates testable "WHEN…SHALL…" acceptance criteria that double as the verification loop's pass/fail checks. *Spec-Kit, Kiro.*
- [ ] **Issue ingestion → agent task** (M) — pull GitHub Issues / Linear items into the tasks kanban, one-click dispatch as an agent, round-trip status + PR link. *Copilot coding agent.*
- [ ] **PR-native output mode** (M) — an approved worktree opens a real PR (branch + CI) instead of/alongside apply; CI status surfaced in Inbox. *Agent HQ, OpenHands.*
- [ ] **Event / schedule triggers** (M) — cron or webhook (git push, issue label, CI fail) auto-launches a mission. *OpenHands automations.*

### Tier 4 — multi-agent & memory frontier
- [ ] **Best-of-N compare** (M) — fan the same task to N worktree agents (varying model/approach), diff results side-by-side, pick/merge the winner. *Nimbalyst, Sculptor.*
- [ ] **Steer mid-run** (M) — inject a message / pause / redirect a *running* agent from the Live page (streaming-input mode) without killing it. *Agent HQ, Antigravity.*
- [ ] **Learned review rules** (M) — distill your gate edits/rejections into per-project rules that feed future launches + the Oracle pass; auto-promote rules that keep proving accurate. *Cursor Bugbot.*
- [ ] **Planner → workers team** (L) — a lead agent decomposes a task and spawns/monitors worker subagents across worktrees, consolidating results. *Amp subagents, Warp Oz.*
- [ ] **Session trace replay + causal timeline** (M) — full multi-step trace of a run (what each agent touched and why), replayable — observability beyond token counts. *Braintrust/Langfuse.*
- [ ] **Context Builder** (M) — tree-sitter signature slices/codemap to pack more of the repo into an agent's token budget precisely. *RepoPrompt CE.*

### Tier 5 — ecosystem / infra
- [ ] **Protégé as an MCP server** (M) — expose dispatch-task/read-status over MCP so other agents/tools drive Protégé. *MCP is the 2026 integration substrate.*
- [ ] **ACP / multi-harness** (L) — run a task on Codex or Gemini CLI, not just Claude Code, from the same UI. *Zed, OpenHands, Devin Desktop.*
- [ ] **Cloud/background offload** (L) — push a mission to a remote sandbox so long jobs run with the laptop closed; results sync to Live/Inbox. *Cursor background agents, Warp Oz.*

## Recommended build order (overnight → next sessions)
1. Prime-launch context → Oracle review → write-back memory (Tier 1; compounding, cheap).
2. Automated verification loop + session eval scoring (Tier 2; the differentiator).
3. Spec/EARS + issue ingestion (Tier 3; the outer loop).
4. Best-of-N + steer-mid-run + learned rules (Tier 4).

## Design principles for the phase
- **Everything flows through the review gate.** Verification, Oracle findings, and eval scores attach there.
- **Reuse the context assembler.** Repo-map + assessment + Brain already exist — feed them into launches, Oracle, and specs.
- **Memory compounds in two layers:** per-run context (Context Builder) and durable, feedback-derived rules/notes (write-back + learned rules + Brain).
- **Prefer local + free where possible** (tests, repo-map, judge on a small model); reserve big models for Oracle/assessment.
