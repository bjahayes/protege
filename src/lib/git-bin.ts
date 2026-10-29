// Server-only. Which git to run. When Protégé is started from somewhere whose PATH lacks git (a
// shortcut, a service), plain "git" fails; Git for Windows' usual install folders are tried next.
// Every git call in Protégé goes through gitExe(), so they all find the same git.
import { execFileSync } from "child_process";
import path from "path";

const g = globalThis as unknown as { __protegeGitExe?: string | null };

/** The git that works here, or null if none does. Found once, then remembered. */
export function resolveGit(): string | null {
  if (g.__protegeGitExe !== undefined) return g.__protegeGitExe;
  const candidates = [
    "git",
    process.env.GIT,
    process.env.ProgramFiles && path.join(process.env.ProgramFiles, "Git", "cmd", "git.exe"),
    process.env["ProgramW6432"] && path.join(process.env["ProgramW6432"]!, "Git", "cmd", "git.exe"),
    process.env["ProgramFiles(x86)"] && path.join(process.env["ProgramFiles(x86)"]!, "Git", "cmd", "git.exe"),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Programs", "Git", "cmd", "git.exe"),
    "C:\\Program Files\\Git\\cmd\\git.exe",
  ].filter(Boolean) as string[];
  for (const c of candidates) {
    try {
      execFileSync(c, ["--version"], { stdio: "ignore", windowsHide: true });
      g.__protegeGitExe = c;
      return c;
    } catch {
      /* try the next */
    }
  }
  g.__protegeGitExe = null;
  return null;
}

/** The git to run: the one found, or plain "git" (whose error then says git is missing). */
export function gitExe(): string {
  return resolveGit() || "git";
}
