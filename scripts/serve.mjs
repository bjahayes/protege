// Starts Next.js for Protégé (`npm run dev` / `npm start` run this).
//
// It makes sure this install has its own access key (data/install-token, created once, never
// published) and puts it in PROTEGE_INSTALL_TOKEN. The request filter (src/middleware.ts) only
// answers API calls that carry the key; the browser gets it as a cookie when it opens a page.
// Scripts can send it in an X-Protege-Token header.
//
// `next dev` and `next build` run in this same process, so stopping Protégé stops everything.
//
// `next start` runs as a child this process looks after, so Protégé can restart itself to load
// a new version (src/lib/restart.ts): it builds into the build folder not in use, waits until no
// session or task is mid-turn, then asks for a swap. This process stops the old server and starts
// the new build on the same port. data/active-build-<port> remembers which folder is in use.
//
// Usage: node scripts/serve.mjs next start -H 127.0.0.1 -p 4317

import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fork } from "child_process";
import { createRequire } from "module";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, "data");
const tokenFile = path.join(dataDir, "install-token");
// The two build folders a restart alternates between (a test copy can name its own).
const BUILDS = (process.env.PROTEGE_BUILDS || ".next,.next-alt").split(",");

fs.mkdirSync(dataDir, { recursive: true });
let token = fs.existsSync(tokenFile) ? fs.readFileSync(tokenFile, "utf8").trim() : "";
if (!/^[a-f0-9]{64}$/.test(token)) {
  token = crypto.randomBytes(32).toString("hex");
  fs.writeFileSync(tokenFile, token + "\n", { mode: 0o600 });
}

const args = process.argv.slice(2);
if (args[0] !== "next") {
  console.error("Usage: node scripts/serve.mjs next <dev|start|build> [options]");
  process.exit(2);
}
const portArg = args.indexOf("-p");
process.env.PROTEGE_INSTALL_TOKEN = token;
process.env.PROTEGE_PORT = portArg >= 0 ? args[portArg + 1] : process.env.PORT || "3000";
// Which build folder is in use, per port, so a copy on another port never changes this one's.
const activeFile = path.join(dataDir, `active-build-${process.env.PROTEGE_PORT}`);
process.chdir(root);
const nextBin = createRequire(import.meta.url).resolve("next/dist/bin/next");

if (args[1] !== "start" || process.env.PROTEGE_DIST_DIR) {
  // Hand over to Next's own command-line program, as if it had been run directly.
  process.argv = [process.argv[0], nextBin, ...args.slice(1)];
  createRequire(import.meta.url)(nextBin);
} else {
  supervise();
}

function supervise() {
  const built = (d) => fs.existsSync(path.join(root, d, "BUILD_ID"));
  const first = BUILDS[0];
  let dist = fs.existsSync(activeFile) ? fs.readFileSync(activeFile, "utf8").trim() : first;
  // A plain `npm run build` writes the first folder; use it if it's newer than the remembered build.
  if (!BUILDS.includes(dist) || !built(dist)) dist = first;
  else if (dist !== first && built(first)) {
    const t = (d) => fs.statSync(path.join(root, d, "BUILD_ID")).mtimeMs;
    if (t(first) > t(dist)) dist = first;
  }
  let child = null;
  let swapping = null;
  let stopping = false;

  const start = () => {
    fs.writeFileSync(activeFile, dist + "\n");
    child = fork(nextBin, args.slice(1), {
      env: { ...process.env, PROTEGE_DIST_DIR: dist, PROTEGE_BUILDS: BUILDS.join(",") },
      stdio: "inherit",
    });
    child.on("message", (m) => {
      if (m?.type === "swap" && BUILDS.includes(m.dist) && built(m.dist) && !swapping) {
        console.log(`\nProtégé: restarting on the new build (${m.dist})…`);
        swapping = m.dist;
        child.kill();
      }
    });
    child.on("exit", (code) => {
      if (swapping) {
        dist = swapping;
        swapping = null;
        start();
      } else process.exit(stopping ? 0 : code ?? 1);
    });
  };
  for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"])
    process.on(sig, () => {
      stopping = true;
      if (child) child.kill();
      else process.exit(0);
    });
  start();
}
