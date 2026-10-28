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
git clone <this repo>
cd protege
npm install
npm run dev
```

Then open **http://127.0.0.1:4317**.

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

## Where things are kept

- Your conversations stay where Claude Code keeps them (`~/.claude/projects/`), so they show up
  in Claude Code and Claude desktop as usual.
- Protégé's own records (registered projects, agent run history and their event logs) are in
  `data/protege.db`. Delete it to start afresh.
- Per-project notes Protégé writes live in each project's `.protege/` folder
  (`assessment.json` for the parts diagram, `tasks.json` for the checklist, `status.md`).

## Safety

- Protégé only listens on your own computer (localhost).
- Anything it runs, it runs as you, with your Claude Code sign-in and settings, exactly as if you
  had run Claude Code yourself. Pick the permission mode to suit the folder.
- Every agent run's prompt and full event stream is kept in `data/protege.db`.

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

See [DESIGN.md](DESIGN.md) for the design and roadmap.
