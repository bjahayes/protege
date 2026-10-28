import { listSessions } from "@anthropic-ai/claude-agent-sdk";

const t0 = Date.now();
const sessions = await listSessions();
console.log(`listSessions() -> ${sessions.length} sessions in ${Date.now() - t0}ms`);

// group by cwd
const byCwd = new Map();
for (const s of sessions) {
  const cwd = s.cwd || "(unknown)";
  if (!byCwd.has(cwd)) byCwd.set(cwd, []);
  byCwd.get(cwd).push(s);
}
console.log(`Unique cwds: ${byCwd.size}`);
const sample = [...byCwd.entries()].slice(0, 8);
for (const [cwd, arr] of sample) {
  const latest = arr.reduce((a, b) => (b.lastModified > a.lastModified ? b : a));
  console.log(`  ${arr.length.toString().padStart(3)}  ${cwd}`);
  console.log(`       last: ${new Date(latest.lastModified).toISOString()}  summary: ${JSON.stringify((latest.summary || latest.firstPrompt || "").slice(0, 60))}`);
}
console.log("\nSample raw session object:");
console.log(JSON.stringify(sessions[0], null, 2));
