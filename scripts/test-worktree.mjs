// End-to-end check of a task on a safe copy (git worktree), against a running Protégé.
// Usage: node scripts/test-worktree.mjs [path-to-a-git-repo]
// With no path, it makes a throwaway repository in the system's temp folder.
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

const BASE = "http://127.0.0.1:4317";
function tempRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "protege-wt-test-"));
  const git = (...a) => execFileSync("git", a, { cwd: dir });
  git("init", "-q");
  fs.writeFileSync(path.join(dir, "README.md"), "# Worktree test repo\n");
  git("add", "README.md");
  git("-c", "user.name=Protégé test", "-c", "user.email=test@example.invalid", "commit", "-q", "-m", "init");
  return dir;
}
const REPO = process.argv[2] || tempRepo();

const j = async (url, opts) => {
  const r = await fetch(BASE + url, opts);
  return { status: r.status, body: await r.json().catch(() => null) };
};
const post = (url, data) =>
  j(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 1. Register
const reg = await post("/api/projects", { path: REPO, name: "WT Test Repo" });
console.log("register:", reg.status, JSON.stringify(reg.body));
const projectId = Buffer.from(reg.body.path, "utf8").toString("base64url");
console.log("projectId:", projectId);

// 2. Launch isolated job
const launch = await post("/api/jobs", {
  projectId,
  prompt:
    "Append a line 'Reviewed by Protégé.' to README.md, and create a new file HELLO.txt containing the single word hello. Make only those two changes, then stop.",
  model: "claude-haiku-4-5-20251001",
  permissionMode: "acceptEdits",
  maxTurns: 12,
  isolate: true,
});
console.log("launch:", launch.status, "job:", launch.body?.job?.id, "worktreeState:", launch.body?.job?.worktreeState);
const jobId = launch.body.job.id;

// 3. Poll
let job;
for (let i = 0; i < 40; i++) {
  await sleep(4000);
  const g = await j(`/api/jobs/${jobId}`);
  job = g.body.job;
  console.log(`  [${i}] status=${job.status} wt=${job.worktreeState} branch=${job.branch || "-"} turns=${job.numTurns ?? "-"}`);
  if (["done", "error", "stopped", "interrupted"].includes(job.status)) break;
}

// 4. Diff
const diff = await j(`/api/jobs/${jobId}/diff`);
console.log("\nDIFF available:", diff.body.diff.available, "files:", diff.body.diff.files?.length,
  "+", diff.body.diff.totalAdditions, "-", diff.body.diff.totalDeletions);
for (const f of diff.body.diff.files || []) {
  console.log(`  ${f.status} ${f.path}  (+${f.additions} -${f.deletions})`);
}
console.log("\n-- first patch preview --");
console.log((diff.body.diff.files?.[0]?.patch || "").split("\n").slice(0, 12).join("\n"));

console.log("\nJOB worktreePath:", job.worktreePath);
console.log("DONE. To apply: POST /api/jobs/" + jobId + "/apply");
process.stdout.write("JOBID=" + jobId + "\n");
