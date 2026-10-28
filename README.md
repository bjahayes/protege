# Protégé (Protégé)

Mission control for your Claude Code projects, in the browser. It finds every folder you've used
Claude Code in, shows where each project is up to, and lets you chat with Claude Code, run several
agents at once and watch them work.

Everything runs on your own computer, using **your own Claude Code sign-in**. There is no server
to deploy and no API key to set up.

## What you need

- **Node.js 20 or later.**
- **Claude Code**, [installed](https://docs.anthropic.com/en/docs/claude-code/setup). If it isn't
  signed in yet, Protégé shows a **Sign in to Claude** button across the top of every page. It opens
  Claude Code's own sign-in in a window of its own, and the Claude sign-in page in your browser.
  Sign in there; if the page shows a code, paste it into that window. The code goes straight to
  Claude Code; Protégé never sees it. Claude Code keeps the sign-in from then on.

  (Being signed in to the Claude desktop app isn't enough by itself: the desktop app keeps its
  sign-in to itself. If Claude desktop is installed, though, Protégé uses its copy of Claude Code,
  which desktop keeps up to date.)

## Quick start

```bash
git clone https://github.com/bjahayes/protege.git
cd protege
npm install
npm run dev
```

Then open **http://127.0.0.1:4317**.

Start it with `npm run dev` (or `npm run build` then `npm start`), not `next dev` directly: the
npm scripts set up this install's access key (see [Safety](#safety)).

## What it does

- **Chat**: talk to Claude Code the way you would in Claude desktop. Every Claude Code
  conversation on your computer is listed, whether it started in a terminal, an IDE, Claude
  desktop or here; open one to read it and carry on, or start a new chat in any project folder.
  Replies stream in as they are written. Each step Claude takes (reading a file, running a
  command, editing) is a compact line you can open to see the command, its output or the lines
  changed. Screenshots that tools return show straight away.
  - **Model and effort**: the picker lists the models your Claude Code offers, and the effort
    levels each one supports.
  - **Permissions**: choose *Ask permissions*, *Accept edits*, *Plan mode*, *Auto* or *Bypass
    permissions*. In *Ask permissions*, Claude stops before editing files or running commands and
    asks you to allow it once, always, or not at all. In *Plan mode* it reads and plans, then asks
    you to approve the plan before changing anything.
  - **Attachments**: attach files and images with the paperclip, by dragging them onto the
    message box, or by pasting. Images and PDFs go to Claude directly; other files are saved under
    `data/uploads/` and Claude opens them with its own tools.
  - You can keep typing while Claude works (it reads your message next), and stop it at any time
    with **Stop** or Esc.
- **Dashboard**: a card for every project, with its docs, tasks, sessions and live agents.
- **Project pages**: where the project is up to, its plan and tasks, its past sessions, and a
  **How it fits together** diagram of its parts. The diagram labels each part (*Working*, *Partly
  built*, *Only started*, *Not working*, *Not sure yet*) and gives the reason for the label. The
  parts and labels come from Claude reading the project's code (**Map → Re-assess**); it doesn't
  run anything.
- **Agents and Live**: every running and recent agent across all projects, with its live output,
  tokens and cost, and a stop button.
- **Simple view**: a plainer version of all this for people who don't write code. Changes are
  made on a safe copy of the project and shown to you before anything is kept.

## Settings

All optional, set as environment variables before `npm run dev`:

| Variable | What it does |
| --- | --- |
| `PROTEGE_CLAUDE_PATH` | Full path to the `claude` program, if Protégé can't find it on your `PATH`. |
| `PROTEGE_ENGINE=sdk` | Run tasks through the Claude Agent SDK instead of the `claude` program. Chats always use the SDK, pointed at your `claude` program. |
| `PROTEGE_ALLOW_API_KEY=1` | Allow Claude Code to use an API key (billed per token). Without it, Protégé removes `ANTHROPIC_API_KEY` and stops any run that would bill an API key instead of your Claude plan. |
| `PROTEGE_PREVIEW_PORT` | The port project previews are served on. Defaults to the port after Protégé's (4318). |

## Where things are kept

- Your conversations stay where Claude Code keeps them (`~/.claude/projects/`), so they show up
  in Claude Code and Claude desktop as usual.
- Protégé's own records (registered projects, agent run history and their event logs) are in
  `data/protege.db`. Delete it to start afresh.
- Per-project notes Protégé writes live in each project's `.protege/` folder
  (`assessment.json` for the parts diagram, `tasks.json` for the checklist, `status.md`). In a
  git project, Protégé lists that folder in the repository's local ignore list
  (`.git/info/exclude`, which isn't committed), so its notes never show up as changes.
- This install's access key is in `data/install-token`.

## Safety

Protégé runs Claude Code as you, so it is built to answer only you, on this computer:

- **Only on this computer.** It listens on 127.0.0.1 only: port 4317 for the app, 4318 for
  project previews. Other computers on your network can't reach it.
- **Only Protégé's own pages.** Its API refuses requests that don't come from a Protégé page:
  it checks the address the request was sent to (127.0.0.1 or localhost only), where the
  request came from, that changes are sent as JSON, and a per-install access key. Your browser
  gets the key as a cookie when you open Protégé; other websites can't send or read it. Scripts
  can send it in an `X-Protege-Token` header (it's in `data/install-token`).
- **Only projects it knows.** It works only in folders you registered, folders you've used
  Claude Code in, and its demo projects.
- **Previews are kept apart.** A project's web page is shown from its own origin (port 4318), in
  a sandboxed frame, and can't act on Protégé.
- **Checks are the project's own.** "Run checks" runs only the test or build command the project
  itself defines.
- **Safe copies where possible.** In git projects, changes are made on a separate copy and kept
  only when you say so; elsewhere they're made directly, and Protégé says so first.
- Anything it runs, it runs with your Claude Code sign-in and settings, exactly as if you had
  run Claude Code yourself. Pick the permission mode to suit the folder.
- Every agent run's prompt and full event stream is kept in `data/protege.db`.

See [SECURITY.md](SECURITY.md) to report a security problem.

## How it's built

Next.js 15 (App Router, TypeScript), Tailwind, SQLite (better-sqlite3) and the Claude Agent SDK.

- `src/lib/engine.ts`: the only place that starts Claude Code. It finds your `claude` program,
  strips API keys, checks the sign-in (`claude auth status`), and starts both one-off runs and
  live chats.
- `src/lib/chat-manager.ts`: one long-lived Claude Code process per open chat; messages,
  approvals, stop, and model, effort and mode changes go through it.
- `src/lib/chat-format.ts`: turns Claude Code messages into chat items, for both saved
  transcripts and live chats.
- `src/lib/job-manager.ts`: agent runs (tasks, assessments), streamed to the browser over
  Server-Sent Events.
- `src/lib/wire-route.ts`: lays out the arrows in the parts diagram so they never cross a card or
  each other, with a checker that counts any that do.
- `src/middleware.ts` and `scripts/serve.mjs`: the request checks and the per-install access key.
- `src/lib/project-guard.ts`: the one way a route turns a project id into a folder.
- `src/lib/preview-server.ts`: serves project previews from their own origin.
- `src/lib/git.ts`: safe copies (git worktrees), Keep, undo and saving to history.

## Tests

```bash
npm test
```

runs two checks that need no model calls: the parts-diagram arrow layout over generated layouts
(`npm run test:diagram`), and keeping a change made on a safe copy, on a throwaway git
repository (`npm run test:keep`). They need Node.js 22.6 or later. CI runs them, the type check
and the release build on Linux and Windows for every push.

See [DESIGN.md](DESIGN.md) for the design and roadmap, and [CONTRIBUTING.md](CONTRIBUTING.md) to
help.
