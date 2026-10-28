import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { PROJECTS_ROOT, slugify } from "./config";
import { registerProject } from "./store";

// The dev server may have been launched with a reduced PATH that doesn't include
// Git. Resolve a working `git` once (bare name first, then common Windows spots)
// so project creation still gets a repo (needed for undo/isolation).
const g = globalThis as unknown as { __protegeGitExe?: string | null };
export function resolveGit(): string | null {
  if (g.__protegeGitExe !== undefined) return g.__protegeGitExe;
  const candidates = [
    "git",
    process.env.GIT,
    process.env.ProgramFiles && path.join(process.env.ProgramFiles, "Git", "cmd", "git.exe"),
    process.env["ProgramW6432"] && path.join(process.env["ProgramW6432"]!, "Git", "cmd", "git.exe"),
    process.env["ProgramFiles(x86)"] && path.join(process.env["ProgramFiles(x86)"]!, "Git", "cmd", "git.exe"),
    "C:\\Program Files\\Git\\cmd\\git.exe",
  ].filter(Boolean) as string[];
  for (const c of candidates) {
    try {
      execFileSync(c, ["--version"], { stdio: "ignore" });
      g.__protegeGitExe = c;
      return c;
    } catch {
      /* try next */
    }
  }
  g.__protegeGitExe = null;
  return null;
}

// ---------------------------------------------------------------------------
// Friendly starter templates. Every template scaffolds a *working* project so
// the user sees something real immediately (and can preview it). The templates
// are deliberately static web pages — no install, no build step, no server —
// which is the least intimidating way to start and previews instantly.
// The user's description is then handed to an agent to tailor it.
// ---------------------------------------------------------------------------

export interface Template {
  id: string;
  name: string;
  emoji: string;
  blurb: string; // one line, plain English
  whatYouGet: string; // what the starter already does
  /** Example of saying what it's for, shown in the description box. */
  describeHint: string;
  /** A blank start has nothing to try until Protégé builds it, so it needs a description. */
  needsDescription?: boolean;
  /** Ideas for a first change, offered at "Make it yours". */
  ideas: string[];
  /** The entry file to open in a live preview. */
  preview: string;
  files: Record<string, string>;
}

function claudeMd(name: string, guidance: string): string {
  return `# ${name}

${guidance}

## How this project runs
- It's a plain web page: open \`index.html\` in a browser. No install or build step.
- Keep it simple and self-contained (HTML + CSS + a little JavaScript in one file is fine).
- Prefer clear, well-commented code — a non-programmer may read it.
`;
}

const WEB_TOOL_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Word & Character Counter</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
         max-width: 640px; margin: 40px auto; padding: 0 20px; line-height: 1.5; }
  h1 { font-size: 1.5rem; }
  textarea { width: 100%; min-height: 200px; padding: 12px; font-size: 1rem;
             border: 1px solid #ccc; border-radius: 10px; box-sizing: border-box; }
  .stats { display: flex; gap: 24px; margin-top: 16px; }
  .stat { background: #f3f4f6; border-radius: 12px; padding: 12px 18px; }
  .stat b { display: block; font-size: 1.6rem; }
  .stat span { color: #555; font-size: .85rem; }
  @media (prefers-color-scheme: dark) { .stat { background: #1f2430; } .stat span { color: #aaa; } }
</style>
</head>
<body>
  <h1>Word &amp; Character Counter</h1>
  <p>Paste or type below. The counts update as you go.</p>
  <textarea id="text" placeholder="Start typing…"></textarea>
  <div class="stats">
    <div class="stat"><b id="words">0</b><span>words</span></div>
    <div class="stat"><b id="chars">0</b><span>characters</span></div>
    <div class="stat"><b id="reading">0 min</b><span>reading time</span></div>
  </div>
<script>
  const text = document.getElementById('text');
  function update() {
    const v = text.value.trim();
    const words = v ? v.split(/\\s+/).length : 0;
    document.getElementById('words').textContent = words;
    document.getElementById('chars').textContent = text.value.length;
    document.getElementById('reading').textContent = Math.max(1, Math.round(words / 200)) + ' min';
  }
  text.addEventListener('input', update);
  update();
</script>
</body>
</html>
`;

const DOC_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Document Builder</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
         max-width: 720px; margin: 40px auto; padding: 0 20px; line-height: 1.5; }
  h1 { font-size: 1.5rem; }
  label { display: block; margin-top: 12px; font-weight: 600; font-size: .9rem; }
  input, textarea { width: 100%; padding: 10px; font-size: 1rem; border: 1px solid #ccc;
                    border-radius: 8px; box-sizing: border-box; margin-top: 4px; }
  .out { white-space: pre-wrap; background: #f3f4f6; border-radius: 12px; padding: 20px; margin-top: 20px; }
  button { margin-top: 14px; margin-right: 8px; padding: 10px 16px; font-size: .95rem;
           border: 0; border-radius: 8px; background: #4f46e5; color: #fff; cursor: pointer; }
  @media (prefers-color-scheme: dark) { .out { background: #1f2430; } }
</style>
</head>
<body>
  <h1>Document Builder</h1>
  <p>Fill in the fields — the finished document appears below. Edit the template in <code>index.html</code> to change the wording.</p>

  <label>Recipient name<input id="name" value="Jordan Smith" /></label>
  <label>Date<input id="date" value="1 September 2026" /></label>
  <label>Subject<input id="subject" value="Confirmation of our meeting" /></label>
  <label>Body<textarea id="body" rows="4">Thank you for your time today. This note confirms what we agreed and the next steps.</textarea></label>

  <div class="out" id="output"></div>
  <button onclick="build()">Update</button>
  <button onclick="copyOut()">Copy</button>
  <button onclick="window.print()">Print / Save as PDF</button>

<script>
  function build() {
    const g = id => document.getElementById(id).value;
    document.getElementById('output').textContent =
      g('date') + "\\n\\nDear " + g('name') + ",\\n\\nRe: " + g('subject') + "\\n\\n" +
      g('body') + "\\n\\nKind regards,\\n";
  }
  function copyOut() { navigator.clipboard.writeText(document.getElementById('output').textContent); }
  ['name','date','subject','body'].forEach(id => document.getElementById(id).addEventListener('input', build));
  build();
</script>
</body>
</html>
`;

const CHECKLIST_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Checklist</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
         max-width: 560px; margin: 40px auto; padding: 0 20px; line-height: 1.5; }
  h1 { font-size: 1.5rem; }
  .row { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid #eee; }
  .row input[type=text] { flex: 1; border: 0; font-size: 1rem; background: transparent; }
  .done label { text-decoration: line-through; color: #999; }
  form { display: flex; gap: 8px; margin-top: 16px; }
  form input { flex: 1; padding: 10px; border: 1px solid #ccc; border-radius: 8px; }
  form button { padding: 10px 16px; border: 0; border-radius: 8px; background: #4f46e5; color: #fff; cursor: pointer; }
  @media (prefers-color-scheme: dark) { .row { border-color: #2a2f3a; } }
</style>
</head>
<body>
  <h1>My Checklist</h1>
  <p>Add items and tick them off. Your list is saved in this browser.</p>
  <div id="list"></div>
  <form onsubmit="add(event)">
    <input id="new" placeholder="Add an item…" />
    <button>Add</button>
  </form>
<script>
  let items = JSON.parse(localStorage.getItem('checklist') || '[]');
  function save() { localStorage.setItem('checklist', JSON.stringify(items)); render(); }
  function add(e) { e.preventDefault(); const v = document.getElementById('new').value.trim();
    if (v) { items.push({ text: v, done: false }); document.getElementById('new').value = ''; save(); } }
  function toggle(i) { items[i].done = !items[i].done; save(); }
  function remove(i) { items.splice(i, 1); save(); }
  function render() {
    document.getElementById('list').innerHTML = items.map((it, i) =>
      '<div class="row ' + (it.done ? 'done' : '') + '">' +
      '<input type="checkbox" ' + (it.done ? 'checked' : '') + ' onchange="toggle(' + i + ')">' +
      '<label>' + it.text.replace(/</g,'&lt;') + '</label>' +
      '<button onclick="remove(' + i + ')" style="border:0;background:none;cursor:pointer;color:#c00">✕</button>' +
      '</div>').join('') || '<p style="color:#999">Nothing yet — add your first item below.</p>';
  }
  render();
</script>
</body>
</html>
`;

export const TEMPLATES: Template[] = [
  {
    id: "web-tool",
    name: "A little web tool",
    emoji: "🧰",
    blurb: "A small tool that runs in a web browser.",
    whatYouGet: "A working word & character counter you can open and use right away — a starting point to shape into your own tool.",
    describeHint: "e.g. 'Count the words in a contract and flag any sentence longer than 40 words.'",
    ideas: [
      "Show how long the text would take to read aloud",
      "Highlight any sentence longer than 40 words",
      "Add a button that copies the counts",
    ],
    preview: "index.html",
    files: {
      "index.html": WEB_TOOL_HTML,
      "CLAUDE.md": claudeMd(
        "A little web tool",
        "A single-page browser tool. The starter is a word/character counter; adapt it into whatever small utility the user describes."
      ),
    },
  },
  {
    id: "doc-generator",
    name: "A document builder",
    emoji: "📄",
    blurb: "Fill in a few fields, get a finished document.",
    whatYouGet: "A form that merges your details into a letter, with Copy and Print/Save-as-PDF buttons.",
    describeHint: "e.g. 'Make it produce a short engagement letter with the client's name, the matter and our fees.'",
    ideas: [
      "Add a field for the client's reference number",
      "Put our firm's name and address at the top of the letter",
      "Change the letter into a short engagement letter",
    ],
    preview: "index.html",
    files: {
      "index.html": DOC_HTML,
      "CLAUDE.md": claudeMd(
        "A document builder",
        "A form that merges fields into a document template. Adjust the fields and the template text to match the document the user wants to produce."
      ),
    },
  },
  {
    id: "checklist",
    name: "A checklist / tracker",
    emoji: "✅",
    blurb: "A simple list you tick off, saved in your browser.",
    whatYouGet: "A working checklist that remembers items between visits.",
    describeHint: "e.g. 'Track the documents we need from a client, with a due date on each.'",
    ideas: [
      "Add a due date to each item",
      "Show how many items are left at the top",
      "Group the items under headings",
    ],
    preview: "index.html",
    files: {
      "index.html": CHECKLIST_HTML,
      "CLAUDE.md": claudeMd(
        "A checklist / tracker",
        "A checklist app that stores items in the browser. Adapt the columns/fields to whatever the user wants to track."
      ),
    },
  },
  {
    id: "blank",
    name: "Something else",
    emoji: "✨",
    blurb: "Start from a blank project and describe what you want.",
    whatYouGet: "An empty project — Protégé builds it from your description.",
    describeHint: "Describe what you'd like to build, in plain words: who uses it, and what it should do.",
    needsDescription: true,
    ideas: [
      "Make the page look tidier",
      "Add a short section explaining how to use it",
      "Add a button that copies the result",
    ],
    preview: "index.html",
    files: {
      "index.html": `<!doctype html>
<html lang="en">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>New Project</title>
<style>body{font-family:system-ui,sans-serif;max-width:600px;margin:60px auto;padding:0 20px;line-height:1.6}</style>
</head>
<body>
  <h1>Your new project</h1>
  <p>This is a blank starting point. Tell Protégé what you'd like to build and it will fill this in.</p>
</body>
</html>
`,
      "CLAUDE.md": claudeMd("New project", "A blank project. Build whatever the user describes, starting from index.html."),
    },
  },
];

export function getTemplate(id: string): Template | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

/** Public-facing metadata (no file bodies) for the picker UI. */
export function templateList() {
  return TEMPLATES.map(({ id, name, emoji, blurb, whatYouGet, describeHint, needsDescription }) => ({
    id,
    name,
    emoji,
    blurb,
    whatYouGet,
    describeHint,
    needsDescription: !!needsDescription,
  }));
}

export interface CreatedProject {
  path: string;
  name: string;
  preview: string;
  gitRepo: boolean;
}

/** Create a real project folder from a template, git-init it, and register it. */
export function createProjectFromTemplate(opts: {
  templateId: string;
  name: string;
}): CreatedProject {
  const tpl = getTemplate(opts.templateId);
  if (!tpl) throw new Error(`Unknown template: ${opts.templateId}`);
  const displayName = (opts.name || tpl.name).trim();

  fs.mkdirSync(PROJECTS_ROOT, { recursive: true });
  // Unique folder under the projects root.
  const base = slugify(displayName);
  let dir = path.join(PROJECTS_ROOT, base);
  let n = 2;
  while (fs.existsSync(dir)) dir = path.join(PROJECTS_ROOT, `${base}-${n++}`);
  fs.mkdirSync(dir, { recursive: true });

  for (const [rel, body] of Object.entries(tpl.files)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, body, "utf8");
  }

  // git init + first commit so isolation, diffs and undo all work later.
  let gitRepo = false;
  const git = resolveGit();
  if (git) {
    try {
      execFileSync(git, ["init"], { cwd: dir, stdio: "ignore" });
      execFileSync(git, ["add", "-A"], { cwd: dir, stdio: "ignore" });
      execFileSync(
        git,
        ["-c", "user.name=Protégé", "-c", "user.email=protege@localhost", "commit", "-m", "Start from template"],
        { cwd: dir, stdio: "ignore" }
      );
      gitRepo = true;
    } catch {
      gitRepo = false; // git present but init failed — project still works, just no undo/isolation
    }
  }

  registerProject(dir, displayName);
  return { path: dir, name: displayName, preview: tpl.preview, gitRepo };
}
