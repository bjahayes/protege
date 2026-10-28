// `npm run restart`: ask the running Protégé to load the latest code. It builds the new version
// while the old one keeps running, waits until no session or task is mid-turn (including the one
// that ran this), then restarts on the new build. Prints where it's up to and returns at once.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const token = fs.readFileSync(path.join(root, "data", "install-token"), "utf8").trim();
const port = process.env.PROTEGE_PORT || "4317";
const origin = `http://127.0.0.1:${port}`;
try {
  const r = await fetch(`${origin}/api/restart`, {
    method: "POST",
    headers: { "X-Protege-Token": token, "Content-Type": "application/json", Origin: origin },
    body: "{}",
  });
  const s = await r.json();
  if (s.phase === "failed") {
    console.error(s.error);
    process.exit(1);
  }
  console.log(
    "Protégé is building the new version. It restarts on it once no session or task is mid-turn, " +
      "so a session that ran this finishes its reply first. Sessions carry on afterwards from their saved history."
  );
} catch {
  console.error(`Protégé isn't answering on ${origin}. Start it with npm start.`);
  process.exit(1);
}
