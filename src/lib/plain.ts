// Plain-English rewording for the Simple (non-technical) view — no jargon.

export function plainStatus(status: string): { label: string; tone: "good" | "warn" | "bad" | "muted" } {
  switch (status) {
    case "starting":
    case "running":
      return { label: "Working on it", tone: "warn" };
    case "idle":
      return { label: "Waiting for you", tone: "warn" };
    case "done":
      return { label: "Finished", tone: "good" };
    case "error":
      return { label: "Ran into a problem", tone: "bad" };
    case "stopped":
      return { label: "Stopped", tone: "muted" };
    case "interrupted":
      return { label: "Interrupted", tone: "muted" };
    default:
      return { label: status, tone: "muted" };
  }
}

// Turn a live activity event into a friendly sentence.
export function plainActivity(e: { type: string; label?: string }): string {
  switch (e.type) {
    case "tool": {
      const name = (e.label || "").split(" ")[0];
      if (name === "Read") return "Reading through your files";
      if (name === "Grep") return "Searching your files";
      if (name === "Glob") return "Looking at what files exist";
      if (name === "Edit" || name === "Write") return "Writing the changes";
      if (name === "Bash") return "Running a step";
      if ((name || "").startsWith("mcp__")) return "Checking something";
      return "Working";
    }
    case "tool_result":
      return "Reviewing what it found";
    case "thinking":
      return "Thinking it through";
    case "text":
      return e.label || "";
    case "checks":
      return "Double-checking its work";
    case "auto_fix":
      return "Fixing a problem it found";
    case "result":
      return "Finished";
    default:
      return "";
  }
}

export const TONE_CLASS: Record<string, string> = {
  good: "text-good",
  warn: "text-warn",
  bad: "text-bad",
  muted: "text-muted",
};

// Turn a raw/technical error into a calm, plain message + a suggested next step.
export function plainError(raw: string): { message: string; hint: string } {
  const s = (raw || "").toLowerCase();
  if (s.includes("isn't signed in") || s.includes("not logged in") || s.includes("failed to authenticate") || s.includes("oauth session"))
    return {
      message: "Claude Code on this computer isn't signed in.",
      hint: "Use “Sign in to Claude” at the top of the page: it opens Claude Code’s own sign-in window and the Claude sign-in page in your browser. Then try again.",
    };
  if (/does not support this model|newer is required|claude update/.test(s))
    return {
      message: "The copy of Claude Code that ran is too old for this model.",
      hint: "Update Claude Code with the button here, or pick a different model, then send your message again.",
    };
  if (s.includes("about to use an api key"))
    return {
      message: "Protégé stopped because Claude Code was about to use an API key instead of your Claude plan.",
      hint: "Remove the key from Claude Code's settings, or ask whoever set up this computer.",
    };
  if (s.includes("couldn't find claude code"))
    return {
      message: "Protégé couldn't find Claude Code on this computer.",
      hint: "Install Claude Code from Anthropic, open it once and sign in. Then try again.",
    };
  if (s.includes("worktree") || s.includes("git"))
    return {
      message: "The assistant couldn't set up a safe copy to work on.",
      hint: "This can happen if the project isn't set up for safe copies. You can still ask questions about it, which is always safe.",
    };
  if (s.includes("max") && s.includes("turn"))
    return {
      message: "The task was bigger than expected and the assistant paused partway.",
      hint: "Try again with a smaller, more specific request — or ask it to continue.",
    };
  if (s.includes("permission") || s.includes("denied"))
    return {
      message: "The assistant wasn't allowed to open part of the project.",
      hint: "That's a safety limit. Try asking a question instead, or point it at a different folder.",
    };
  if (s.includes("missing") || s.includes("enoent") || s.includes("not found"))
    return {
      message: "The assistant couldn't find something it expected.",
      hint: "The project may have moved or a file may be missing. Try reopening it from your projects.",
    };
  return {
    message: "Something didn't go to plan.",
    hint: "Nothing was changed. You can try again, or rephrase what you'd like.",
  };
}
