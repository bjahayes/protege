// Starts Next.js for Protégé (`npm run dev` / `npm start` run this).
//
// It makes sure this install has its own access key (data/install-token, created once, never
// published), puts it in PROTEGE_INSTALL_TOKEN, then runs the given `next` command in this same
// process, so stopping Protégé stops everything. The request filter (src/middleware.ts) only
// answers API calls that carry the key; the browser gets it as a cookie when it opens a page.
// Scripts can send it in an X-Protege-Token header.
//
// Usage: node scripts/serve.mjs next dev -H 127.0.0.1 -p 4317

import crypto from "crypto";
import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, "data");
const tokenFile = path.join(dataDir, "install-token");

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

// Hand over to Next's own command-line program, as if it had been run directly.
process.chdir(root);
const nextBin = createRequire(import.meta.url).resolve("next/dist/bin/next");
process.argv = [process.argv[0], nextBin, ...args.slice(1)];
createRequire(import.meta.url)(nextBin);
