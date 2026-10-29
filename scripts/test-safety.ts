// Checks for the safety fixes of 2026-10-29 that need no server and no model:
//   1. preview keys: one project's key never opens another project or a safe copy;
//   2. preview files: hidden files, key files and node_modules are never served, nor anything outside the folder;
//   3. a home folder, a drive root, or a folder holding the home folder is too broad to preview;
//   4. the noise filter hides safe copies and temp folders on Windows, macOS and Linux, and keeps real projects;
//   5. restoring a document version keeps edits that were never saved as a version.
// Run: npm run test:safety
import fs from "fs";
import os from "os";
import path from "path";
import { previewKey, previewKeyOk, previewPath } from "../src/lib/preview-key";
import { resolvePreviewFile, tooBroad } from "../src/lib/preview";
import { isNoisePath } from "../src/lib/config";
import { listVersions, readVersion, recordVersion, restoreVersion } from "../src/lib/doc-versions";

let failed = 0;
function check(name: string, ok: boolean) {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}`);
  if (!ok) failed++;
}

// 1. Preview keys.
process.env.PROTEGE_INSTALL_TOKEN = "test-install-token";
const a = "projA", b = "projB";
check("a project's own key opens it", previewKeyOk("project", a, previewKey("project", a)));
check("project A's key doesn't open project B", !previewKeyOk("project", b, previewKey("project", a)));
check("a project's key doesn't open a safe copy of the same id", !previewKeyOk("job", a, previewKey("project", a)));
check("no key opens nothing", !previewKeyOk("project", a, ""));
check("a key one character short opens nothing", !previewKeyOk("project", a, previewKey("project", a).slice(1)));
check("the project address carries its key", previewPath("project", a) === `/${previewKey("project", a)}/${a}/`);
check("the safe-copy address carries its key", previewPath("job", "j1") === `/_job/${previewKey("job", "j1")}/j1/`);
const ours = previewKey("project", a);
process.env.PROTEGE_INSTALL_TOKEN = "another-install";
check("another install's keys differ", previewKey("project", a) !== ours);
process.env.PROTEGE_INSTALL_TOKEN = "test-install-token";

// 2. Preview files.
const root = fs.mkdtempSync(path.join(os.tmpdir(), "protege-safety-"));
const proj = path.join(root, "site");
for (const [f, t] of Object.entries({
  "index.html": "<h1>hi</h1>",
  "app.js": "1",
  ".env": "SECRET=1",
  ".git/config": "[core]",
  ".protege/tasks.json": "{}",
  "node_modules/x/index.js": "1",
  "certs/server.key": "k",
  "data.sqlite": "x",
  "sub/index.html": "<p>sub</p>",
})) {
  fs.mkdirSync(path.dirname(path.join(proj, f)), { recursive: true });
  fs.writeFileSync(path.join(proj, f), t);
}
fs.writeFileSync(path.join(root, "outside.txt"), "no");
const serves = (parts: string[]) => resolvePreviewFile(proj, parts) !== null;
check("serves the page", serves(["index.html"]));
check("serves a script", serves(["app.js"]));
check("serves a folder's index page", serves(["sub"]));
check("finds the entry page for an empty path", serves([]));
check("never serves .env", !serves([".env"]));
check("never serves inside .git", !serves([".git", "config"]));
check("never serves Protégé's notes", !serves([".protege", "tasks.json"]));
check("never serves node_modules", !serves(["node_modules", "x", "index.js"]));
check("never serves a key file", !serves(["certs", "server.key"]));
check("never serves a database file", !serves(["data.sqlite"]));
check("never serves outside the folder", !serves(["..", "outside.txt"]));

// 3. Folders too broad to preview.
const home = os.homedir();
check("the home folder is too broad", tooBroad(home));
check("the drive root is too broad", tooBroad(path.parse(home).root));
check("the folder holding the home folder is too broad", tooBroad(path.dirname(home)));
check("a project in the home folder is fine", !tooBroad(path.join(home, "Projects", "site")));

// 4. Noise filter.
const noise: [string, boolean][] = [
  ["C:\\Users\\Sam\\AppData\\Local\\Temp\\protege-worktrees\\abc", true],
  ["C:\\Users\\Sam\\.protege\\safe-copies\\abc12345", true],
  ["/Users/sam/.protege/safe-copies/abc12345", true],
  ["/private/var/folders/xy/T/protege-worktrees/abc", true],
  ["/var/folders/xy/T/something", true],
  ["/tmp/claude-run", true],
  ["/var/tmp/x", true],
  ["C:\\Users\\Sam\\Site", false],
  ["/Users/sam/code/site", false],
  ["/home/sam/projects/tmpfiles", false],
];
for (const [p, want] of noise) check(`noise filter ${want ? "hides" : "keeps"} ${p}`, isNoisePath(p) === want);

// 5. Restore keeps unsaved edits.
const docDir = path.join(root, "docs-project");
fs.mkdirSync(docDir, { recursive: true });
const doc = path.join(docDir, "PLAN.md");
fs.writeFileSync(doc, "one");
recordVersion(docDir, "PLAN.md", { by: "test" });
fs.writeFileSync(doc, "two");
recordVersion(docDir, "PLAN.md", { by: "test" });
fs.writeFileSync(doc, "three, never saved as a version");
restoreVersion(docDir, "PLAN.md", 1);
const vs = listVersions(docDir, "PLAN.md");
check("restore puts the old text back", fs.readFileSync(doc, "utf8") === "one");
check("the unsaved edit is kept as a version", vs.some((v) => readVersion(docDir, "PLAN.md", v.n) === "three, never saved as a version"));
check("the kept edit says why", vs.some((v) => v.by === "Saved before restoring version 1"));
restoreVersion(docDir, "PLAN.md", 2);
check("restoring with nothing unsaved adds no extra version", listVersions(docDir, "PLAN.md").length === vs.length + 1);

fs.rmSync(root, { recursive: true, force: true });
console.log(failed ? `\n${failed} check(s) failed` : "\nall safety checks passed");
process.exit(failed ? 1 : 0);
