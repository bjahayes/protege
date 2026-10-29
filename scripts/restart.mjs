// `npm run restart`: ask the running Protégé to load the latest code. It builds the new version
// while the old one keeps running, waits until no session or task is mid-turn (including the one
// that ran this), then restarts on the new build. Prints where it's up to and returns at once.
// `npm run restart -- --force` restarts as soon as it's built, without waiting: use it when the
// session that ran it is the thing being waited for (it would wait for itself).

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const token = fs.readFileSync(path.join(root, "data", "install-token"), "utf8").trim();
const port = process.env.PROTEGE_PORT || "4317";
const origin = `http://127.0.0.1:${port}`;
const force = process.argv.includes("--force");
try {
  const r = await fetch(`${origin}/api/restart`, {
    method: "POST",
    headers: { "X-Protege-Token": token, "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify(force ? { action: "force" } : {}),
  });
  const s = await r.json();
  if (s.phase === "failed") {
    console.error(s.error);
    process.exit(1);
  }
  console.log(
    force
      ? "Protégé is building the new version and restarts on it as soon as it's built. Anything mid-turn stops then, and carries on from its saved history."
      : "Protégé is building the new version. It restarts on it once no session or task is mid-turn, " +
          "so a session that ran this finishes its reply first. Sessions carry on afterwards from their saved history. " +
          "To restart without waiting: npm run restart -- --force"
  );
} catch {
  console.error(`Protégé isn't answering on ${origin}. Start it with npm start.`);
  process.exit(1);
}
