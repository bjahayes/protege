const BASE = "http://127.0.0.1:4317";
const get = (u) => fetch(BASE + u).then((r) => r.json());
const post = (u, d) => fetch(BASE + u, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d || {}) }).then((r) => r.json());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Skip discovery noise (temp/scratch dirs) and the test repo.
const NOISE = /(^work_|^clean_dir|WT Test Repo|scratchpad|AppData|[\\/]te?mp[\\/])/i;

const { projects } = await get("/api/projects");
const real = projects
  .filter((p) => p.exists && p.sessionCount >= 1 && !NOISE.test(p.name) && !NOISE.test(p.path))
  .sort((a, b) => (b.lastActivity || 0) - (a.lastActivity || 0))
  .slice(0, 18);

console.log(`Candidate projects: ${real.length}`);

// Find which already have a plain summary.
const todo = [];
for (const p of real) {
  const s = await get(`/api/projects/${p.id}/plain-summary`);
  if (s.summary) console.log(`  ✓ ${p.name} — already has one`);
  else todo.push(p);
}
console.log(`\nGenerating for ${todo.length} projects (haiku, 3 at a time)…\n`);

const CONCURRENCY = 3;
let done = 0;
async function worker(queue) {
  while (queue.length) {
    const p = queue.shift();
    const l = await post(`/api/projects/${p.id}/plain-summary`, { model: "claude-haiku-4-5-20251001" });
    const jid = l.job?.id;
    if (!jid) { console.log(`  ✗ ${p.name} — failed to launch`); continue; }
    let job;
    for (let i = 0; i < 40; i++) {
      await sleep(5000);
      job = (await get(`/api/jobs/${jid}`)).job;
      if (["done", "error", "stopped"].includes(job.status)) break;
    }
    const s = await get(`/api/projects/${p.id}/plain-summary`);
    done++;
    console.log(`  [${done}/${todo.length}] ${p.name} — ${job.status}${s.summary ? " ✓ summary written" : " (no summary)"}`);
  }
}

const queue = [...todo];
await Promise.all(Array.from({ length: CONCURRENCY }, () => worker(queue)));
console.log("\nBatch complete.");
