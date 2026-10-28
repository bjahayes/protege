import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { getDb } from "./store";

export interface VerifyResult {
  available: boolean;
  reason?: string;
  command?: string;
  exitCode?: number;
  passed?: boolean;
  output?: string;
}

export function detectVerifyCommand(dir: string): { command: string; label: string } | null {
  try {
    const pkgPath = path.join(dir, "package.json");
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
      const s = pkg.scripts || {};
      for (const name of ["test", "lint", "typecheck", "build"]) {
        if (s[name] && !/no test specified/i.test(String(s[name]))) {
          return { command: `npm run ${name}`, label: `npm run ${name}` };
        }
      }
    }
    if (fs.existsSync(path.join(dir, "pytest.ini")) || fs.existsSync(path.join(dir, "tests"))) {
      return { command: "pytest -q", label: "pytest -q" };
    }
    if (fs.existsSync(path.join(dir, "Makefile"))) return { command: "make test", label: "make test" };
    if (fs.existsSync(path.join(dir, "Cargo.toml"))) return { command: "cargo test", label: "cargo test" };
    if (fs.existsSync(path.join(dir, "go.mod"))) return { command: "go test ./...", label: "go test ./..." };
  } catch {
    /* ignore */
  }
  return null;
}

export function runVerifyCommand(command: string, cwd: string): Promise<{ exitCode: number; output: string }> {
  return new Promise((resolve) => {
    exec(command, { cwd, timeout: 240_000, maxBuffer: 8 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
      const out = ((stdout || "") + "\n" + (stderr || "")).trim();
      const tail = out.length > 12000 ? out.slice(-12000) : out;
      resolve({ exitCode: err ? (typeof (err as any).code === "number" ? (err as any).code : 1) : 0, output: tail });
    });
  });
}

export async function verifyDir(dir: string, override?: string): Promise<VerifyResult> {
  const detected = override ? { command: override, label: override } : detectVerifyCommand(dir);
  if (!detected) {
    return { available: false, reason: "No test/build command detected (no package.json test script, pytest, Makefile, etc.)." };
  }
  const r = await runVerifyCommand(detected.command, dir);
  return { available: true, command: detected.label, exitCode: r.exitCode, passed: r.exitCode === 0, output: r.output };
}

export function persistChecks(jobId: string, passed: boolean, command: string) {
  try {
    getDb().prepare(`UPDATE jobs SET checks_passed = ?, checks_command = ? WHERE id = ?`).run(passed ? 1 : 0, command, jobId);
  } catch {
    /* ignore */
  }
}
