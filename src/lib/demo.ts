import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import type { ProjectSummary, Job, Task } from "./types";
import type { Assessment, ComponentInfo } from "./assessment";
import { assessmentPath, readAssessment } from "./assessment";
import { PROJECTS_ROOT } from "./config";
import { resolveGit } from "./templates";
import { readProjectDocs, writeTasks } from "./docs";
import { readPlainSummary, plainSummaryPath } from "./plain-summary";
import { findPreviewEntry } from "./preview";
import { getJobManager } from "./job-manager";
import { META_DIR } from "./meta";

// ---------------------------------------------------------------------------
// Demo mode. A set of made-up projects that a new user (e.g. a lawyer trying
// this out) can explore and — crucially — actually build on, WITHOUT touching
// their real work. The projects are seeded (materialized) to real folders on
// disk under PROJECTS_ROOT/.demo/<id> the first time they're opened, so the
// real agent can genuinely code changes and the live preview reflects them.
// "Reset this demo" restores a project to its original starting point.
// ---------------------------------------------------------------------------

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export function isDemoId(id: string): boolean {
  return id.startsWith("demo-");
}

interface DemoProject {
  id: string;
  name: string;
  tagline: string; // shown as the plain summary line on cards
  plainSummary: string; // markdown
  done: string[]; // concrete things that already work
  whatsLeft: string[]; // concrete things still to do — the progress bar is done/(done+left)
  phase: string;
  stack: string[];
  lastActivityAgo: number;
  liveAgents: number;
  history: { prompt: string; status: Job["status"]; state: Job["worktreeState"]; agoMs: number }[];
  suggestions: { kind: "do" | "ask"; text: string }[];
  site: string; // a working static web page for the live preview
  /** The parts of the page, as an assessment of its code would describe them (true to `site`). */
  parts: ComponentInfo[];
  /** How the parts connect, as a Mermaid flowchart whose labels are the parts' names. */
  flow: string;
  architecture: string;
  risks: string[];
}

// --- The made-up projects -------------------------------------------------

const INTAKE_SITE = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Client Intake</title>
<style>
 body{font-family:system-ui,Segoe UI,Roboto,sans-serif;max-width:640px;margin:32px auto;padding:0 20px;color:#1f2430;background:#fff}
 h1{font-size:1.4rem;margin-bottom:2px} .sub{color:#667;margin-top:0}
 label{display:block;font-weight:600;font-size:.85rem;margin-top:14px}
 input,select,textarea{width:100%;padding:10px;border:1px solid #cbd2e0;border-radius:8px;box-sizing:border-box;margin-top:4px;font-size:1rem}
 .row{display:flex;gap:12px}.row>div{flex:1}
 button{margin-top:16px;padding:11px 18px;border:0;border-radius:9px;background:#4f46e5;color:#fff;font-size:.95rem;cursor:pointer}
 .card{margin-top:18px;padding:16px;border:1px solid #e5e8f0;border-radius:12px;background:#f7f8fc;white-space:pre-wrap;font-size:.92rem}
 .pill{display:inline-block;background:#eef;border-radius:20px;padding:2px 10px;font-size:.75rem;color:#4f46e5}
</style></head><body>
 <span class="pill">New client &amp; matter</span>
 <h1>Client Intake</h1>
 <p class="sub">Capture a new matter in under a minute. Nothing is sent anywhere — it stays on this page.</p>
 <div class="row"><div><label>Client name<input id="client" value="Meridian Foods Ltd"></label></div>
 <div><label>Matter type<select id="type"><option>Commercial contract</option><option>Employment</option><option>Dispute</option><option>Property</option></select></label></div></div>
 <div class="row"><div><label>Responsible lawyer<input id="lawyer" value="A. Okafor"></label></div>
 <div><label>Estimated value (£)<input id="value" value="45,000"></label></div></div>
 <label>Notes<textarea id="notes" rows="3">Reviewing supplier agreement; wants turnaround by month end.</textarea></label>
 <button onclick="build()">Create matter summary</button>
 <div class="card" id="out"></div>
<script>
 function build(){const g=i=>document.getElementById(i).value;
  document.getElementById('out').textContent=
   'MATTER SUMMARY\\n'+'—'.repeat(24)+'\\nClient:  '+g('client')+'\\nType:    '+g('type')+
   '\\nLawyer:  '+g('lawyer')+'\\nValue:   £'+g('value')+'\\n\\nNotes:\\n'+g('notes')+
   '\\n\\nOpened: today · Reference: M-'+Math.floor(1000+g('client').length*37)}
 build();
</script></body></html>`;

const CLAUSE_SITE = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Clause Library</title>
<style>
 body{font-family:system-ui,Segoe UI,Roboto,sans-serif;max-width:720px;margin:32px auto;padding:0 20px;color:#1f2430;background:#fff}
 h1{font-size:1.4rem;margin-bottom:2px}.sub{color:#667;margin-top:2px}
 input{width:100%;padding:11px 14px;border:1px solid #cbd2e0;border-radius:10px;box-sizing:border-box;font-size:1rem;margin:14px 0}
 .clause{border:1px solid #e5e8f0;border-radius:12px;padding:14px 16px;margin-bottom:10px}
 .clause h3{margin:0 0 4px;font-size:1rem}.tag{font-size:.72rem;color:#4f46e5;background:#eef;border-radius:20px;padding:2px 9px;margin-left:6px}
 .clause p{margin:6px 0 0;color:#444;font-size:.9rem}
 button{margin-top:8px;border:1px solid #cbd2e0;background:#fff;border-radius:8px;padding:6px 12px;font-size:.8rem;cursor:pointer}
</style></head><body>
 <h1>Clause Library</h1><p class="sub">Search reusable clauses and copy the one you need.</p>
 <input id="q" placeholder="Search clauses… (try &quot;confidential&quot;)" oninput="render()">
 <div id="list"></div>
<script>
 const CLAUSES=[
  {t:'Confidentiality',tag:'Mutual',b:'Each party shall keep confidential all information disclosed by the other and use it solely for the purpose of this agreement.'},
  {t:'Governing law',tag:'Boilerplate',b:'This agreement and any dispute arising out of it shall be governed by the laws of England and Wales.'},
  {t:'Limitation of liability',tag:'Risk',b:'Neither party shall be liable for indirect or consequential loss; total liability shall not exceed the fees paid in the prior 12 months.'},
  {t:'Termination for convenience',tag:'Exit',b:'Either party may terminate on thirty (30) days written notice without cause.'},
  {t:'Force majeure',tag:'Boilerplate',b:'Neither party is liable for delay caused by events beyond its reasonable control.'}];
 function render(){const q=document.getElementById('q').value.toLowerCase();
  document.getElementById('list').innerHTML=CLAUSES.filter(c=>(c.t+c.tag+c.b).toLowerCase().includes(q))
   .map((c,i)=>'<div class="clause"><h3>'+c.t+'<span class="tag">'+c.tag+'</span></h3><p>'+c.b+'</p>'+
   '<button onclick="copy('+i+')">Copy</button></div>').join('')||'<p style="color:#999">No clauses match.</p>';}
 function copy(i){navigator.clipboard&&navigator.clipboard.writeText(CLAUSES[i].b)}
 render();
</script></body></html>`;

const DEADLINE_SITE = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Deadline Tracker</title>
<style>
 body{font-family:system-ui,Segoe UI,Roboto,sans-serif;max-width:680px;margin:32px auto;padding:0 20px;color:#1f2430;background:#fff}
 h1{font-size:1.4rem;margin-bottom:2px}.sub{color:#667;margin-top:2px}
 table{width:100%;border-collapse:collapse;margin-top:16px}th,td{text-align:left;padding:10px 8px;border-bottom:1px solid #eef}
 th{font-size:.78rem;color:#889;text-transform:uppercase;letter-spacing:.03em}
 .days{font-weight:700}.soon{color:#c2410c}.ok{color:#15803d}.late{color:#b91c1c}
 .bar{height:6px;border-radius:6px;background:#eef;overflow:hidden;margin-top:3px}.bar>i{display:block;height:100%;background:#4f46e5}
</style></head><body>
 <h1>Filing Deadline Tracker</h1><p class="sub">Days remaining on each matter, at a glance.</p>
 <table><thead><tr><th>Matter</th><th>Filing</th><th>Due in</th></tr></thead><tbody id="rows"></tbody></table>
<script>
 const M=[{m:'Meridian Foods — defence',days:3},{m:'Attwater lease renewal',days:12},
  {m:'Bramble Ltd disclosure',days:26},{m:'Corbin appeal bundle',days:-1}];
 document.getElementById('rows').innerHTML=M.map(x=>{
  const cls=x.days<0?'late':x.days<=5?'soon':'ok';
  const label=x.days<0?Math.abs(x.days)+' day(s) overdue':x.days+' day(s)';
  const pct=Math.max(0,Math.min(100,100-(x.days/30*100)));
  return '<tr><td>'+x.m+'</td><td>court filing</td><td><span class="days '+cls+'">'+label+'</span>'+
   '<div class="bar"><i style="width:'+pct+'%"></i></div></td></tr>';}).join('');
</script></body></html>`;

const DEMO: DemoProject[] = [
  {
    id: "demo-intake-portal",
    name: "Client Intake",
    tagline: "A quick form that turns new-client details into a tidy matter summary.",
    done: [
      "Enter the client, matter type, responsible lawyer and notes",
      "Add an estimated value for the matter",
      "Produce a clean summary you can copy",
    ],
    whatsLeft: [
      "Save past matters so you can look them up later",
      "Add a button to save the summary as a PDF",
    ],
    phase: "mvp",
    stack: ["Web page (HTML/JS)"],
    lastActivityAgo: 25 * MIN,
    liveAgents: 0,
    plainSummary:
      "This is a little **intake form** for opening a new client matter. You type in the client, the type of work, who's responsible and a few notes, and it produces a clean summary you can paste into your files.\n\nIt works entirely on your own computer — nothing is sent anywhere. Think of it like a smart paper form that fills itself in neatly.\n\n**Where it's up to:** the form and summary work. The next ideas are saving past matters and printing to PDF.",
    history: [
      { prompt: "Add an 'estimated value' field to the form", status: "done", state: "applied", agoMs: 25 * MIN },
      { prompt: "Make the summary easier to copy", status: "done", state: "applied", agoMs: 3 * HOUR },
      { prompt: "Change the colours to match our letterhead", status: "done", state: "reverted", agoMs: 2 * DAY },
    ],
    suggestions: [
      { kind: "do", text: "Add a button to print the summary as a PDF" },
      { kind: "do", text: "Remember past matters so I can look them up later" },
      { kind: "ask", text: "What information does this form currently collect?" },
    ],
    site: INTAKE_SITE,
    parts: [
      {
        name: "Intake form",
        path: "index.html (form on the page)",
        what: "The form you fill in: client, matter type, responsible lawyer, estimated value and notes.",
        does: "Collects the details of a new matter.",
        status: "solid",
        statusWhy: "All five fields are on the page, and each one is read when you press Create matter summary.",
        issues: [],
      },
      {
        name: "Summary builder",
        path: "index.html (build function)",
        what: "The step that turns the form into a matter summary.",
        does: "Reads every field and lays them out as a summary with a reference number.",
        status: "solid",
        statusWhy: "Its code uses all five fields and writes the finished summary onto the page.",
        issues: [
          "The reference number comes from the length of the client's name, so two clients with names of the same length get the same reference.",
          "\"Opened: today\" is fixed text, not the actual date.",
        ],
      },
      {
        name: "Summary card",
        path: "index.html (summary view)",
        what: "The box under the form showing the finished summary.",
        does: "Shows the summary laid out ready to copy into your files.",
        status: "solid",
        statusWhy: "The summary appears in the box as soon as it is built, including when the page first opens.",
        issues: [],
      },
      {
        name: "Saved matters",
        path: "index.html (storage)",
        what: "Where past matters would be kept, so you could look them up later.",
        does: "Nothing yet.",
        status: "stub",
        statusWhy: "The page keeps no record: once it is closed, the summary is gone.",
        issues: ["Past matters aren't saved anywhere yet (it's on the to-do list)."],
      },
    ],
    flow: [
      "graph TD",
      '  F["Intake form"] -->|field values| B["Summary builder"]',
      '  B -->|summary text| C["Summary card"]',
      '  B -->|matters to keep| S["Saved matters"]',
    ].join("\n"),
    architecture: "One web page: the form feeds a small function that writes the summary into a box below it.",
    risks: ["Reference numbers can repeat, so they shouldn't be relied on to tell matters apart."],
  },
  {
    id: "demo-clause-library",
    name: "Clause Library",
    tagline: "A searchable list of reusable contract clauses with one-click copy.",
    done: [
      "Search clauses by keyword",
      "Copy a clause with one click",
      "Ship a starter set of common clauses",
    ],
    whatsLeft: [
      "Make Copy copy the right clause after a search",
      "Show a 'copied!' tick after copying",
      "Let you add your own clauses and save them",
      "Group clauses by category with headings",
      "Search by category as well as by words",
    ],
    phase: "mvp",
    stack: ["Web page (HTML/JS)"],
    lastActivityAgo: 4 * HOUR,
    liveAgents: 1,
    plainSummary:
      "A **searchable library of standard clauses** you reuse in contracts. Type a word like \"confidential\" and it filters to the matching clauses, and you can copy any one with a click.\n\nEverything is stored right in the page — it's like a well-organised folder of your favourite wording that you can search instantly.\n\n**Where it's up to:** search and copy work with a starter set of clauses. Next up: adding your own clauses and grouping them by category.",
    history: [
      { prompt: "Add a 'force majeure' clause to the library", status: "done", state: "applied", agoMs: 4 * HOUR },
      { prompt: "Let me search by category as well as words", status: "running", state: "active", agoMs: 2 * MIN },
      { prompt: "Make the copy button show a 'copied!' tick", status: "done", state: "discarded", agoMs: 1 * DAY },
    ],
    suggestions: [
      { kind: "do", text: "Make Copy copy the right clause after I've searched" },
      { kind: "do", text: "Let me add my own clauses and save them" },
      { kind: "ask", text: "Which clauses are in the library right now?" },
    ],
    site: CLAUSE_SITE,
    parts: [
      {
        name: "Search box",
        path: "index.html (search on the page)",
        what: "The box at the top where you type words to look for.",
        does: "Narrows the list to clauses whose title, tag or wording contains what you typed.",
        status: "solid",
        statusWhy: "Each letter you type redraws the list with only the matching clauses, and it says so when none match.",
        issues: [],
      },
      {
        name: "Clause list",
        path: "index.html (clause list view)",
        what: "The clauses shown on the page, each with its tag and a Copy button.",
        does: "Shows every clause that matches the search.",
        status: "solid",
        statusWhy: "It draws each matching clause with its title, tag and full wording.",
        issues: [],
      },
      {
        name: "Copy button",
        path: "index.html (copy function)",
        what: "The Copy button on each clause.",
        does: "Puts a clause's wording on your clipboard, ready to paste.",
        status: "broken",
        statusWhy:
          "After a search it copies the wrong clause: it counts the clause's place in the search results but looks it up in the full list.",
        issues: [
          "With no search typed, it copies the right clause; after searching, it can copy a different one.",
          "There's no sign it worked: no 'copied!' tick, and if the browser blocks the clipboard it silently does nothing.",
        ],
      },
      {
        name: "Starter clauses",
        path: "index.html (clause store)",
        what: "Five common clauses written into the page: confidentiality, governing law, limitation of liability, termination and force majeure.",
        does: "Supplies the clauses the list shows.",
        status: "partial",
        statusWhy: "The five clauses load and can be searched, but they're written into the page, so you can't add or save your own.",
        issues: ["Adding your own clauses needs somewhere to keep them, which doesn't exist yet."],
      },
    ],
    flow: [
      "graph TD",
      '  Q["Search box"] -->|search words| L["Clause list"]',
      '  D["Starter clauses"] -->|clauses| L',
      '  L -->|chosen clause| C["Copy button"]',
    ].join("\n"),
    architecture: "One web page: a list of clauses kept in the page, filtered by the search box, each with a Copy button.",
    risks: ["Copying the wrong clause into a contract without noticing; check what you paste until Copy is fixed."],
  },
  {
    id: "demo-deadline-tracker",
    name: "Deadline Tracker",
    tagline: "Shows how many days are left on each matter's filing deadline.",
    done: [
      "List each matter with its filing type",
      "Show how many days are left",
      "Colour-code urgent matters and overdue ones",
      "Add a progress bar to each row",
    ],
    whatsLeft: [
      "Count down from real dates instead of fixed numbers",
      "Let you add and edit your own matters and dates",
      "Sort so the most urgent matter is always on top",
      "Show a reminder as a deadline gets close",
    ],
    phase: "prototype",
    stack: ["Web page (HTML/JS)"],
    lastActivityAgo: 2 * DAY,
    liveAgents: 0,
    plainSummary:
      "A simple **board of upcoming filing deadlines**. Each matter shows how many days are left, with a colour and a little bar so the urgent ones jump out — and overdue ones go red.\n\nIt's an at-a-glance version of a deadlines spreadsheet, easier to read at a glance.\n\n**Where it's up to:** the display works with example matters. The next step is letting you add and edit your own matters and dates.",
    history: [
      { prompt: "Turn overdue matters red", status: "done", state: "applied", agoMs: 2 * DAY },
      { prompt: "Add a progress bar to each row", status: "done", state: "applied", agoMs: 5 * DAY },
    ],
    suggestions: [
      { kind: "do", text: "Make it count down from real due dates" },
      { kind: "do", text: "Sort so the most urgent matter is always on top" },
      { kind: "ask", text: "How does it decide what counts as urgent?" },
    ],
    site: DEADLINE_SITE,
    parts: [
      {
        name: "Deadline board",
        path: "index.html (table on the page)",
        what: "The table of matters, each with its filing, days left and a bar.",
        does: "Shows every deadline at a glance.",
        status: "solid",
        statusWhy: "It draws one row per matter with its days left, its colour and a bar that fills as the deadline nears.",
        issues: ["Every row says \"court filing\": the filing type isn't stored per matter."],
      },
      {
        name: "Urgency colours",
        path: "index.html (colour rules)",
        what: "The rule that colours each matter.",
        does: "Red once a deadline has passed, amber at five days or fewer, green otherwise.",
        status: "solid",
        statusWhy: "The rule is written out in the code and applied to every row.",
        issues: [],
      },
      {
        name: "Matter list",
        path: "index.html (matters kept in the page)",
        what: "The four matters the board shows, written into the page itself.",
        does: "Supplies each matter's name and days left.",
        status: "partial",
        statusWhy:
          "The days left are typed in as fixed numbers rather than worked out from due dates, so they never count down.",
        issues: ["You can't add or edit matters without changing the page itself."],
      },
    ],
    flow: [
      "graph TD",
      '  M["Matter list"] -->|days left| U["Urgency colours"]',
      '  M -->|matters| B["Deadline board"]',
      '  U -->|colour for each row| B',
    ].join("\n"),
    architecture: "One web page: a fixed list of matters, coloured by urgency, drawn as a table.",
    risks: ["The days left don't change by themselves, so the board goes out of date unless the page is edited."],
  },
];

function byId(id: string): DemoProject | undefined {
  return DEMO.find((d) => d.id === id);
}

// --- Materializing demo projects to real folders --------------------------

const DEMO_ROOT = path.join(PROJECTS_ROOT, ".demo");

/** The on-disk folder a demo project lives in (stable, may not exist yet). */
export function demoPathFor(id: string): string {
  return path.join(DEMO_ROOT, id);
}

function completenessOf(d: DemoProject): number {
  const total = d.done.length + d.whatsLeft.length;
  return total ? Math.round((d.done.length / total) * 100) : 0;
}

function demoAssessment(d: DemoProject): Assessment {
  return {
    generatedAt: Date.now(),
    oneLiner: d.tagline,
    status: d.plainSummary.split("\n").slice(-1)[0],
    phase: d.phase,
    completeness: completenessOf(d),
    stack: d.stack,
    components: d.parts,
    architecture: { mermaid: d.flow, description: d.architecture },
    inferredPlan: [
      { phase: "Built so far", items: d.done.map((title) => ({ title, done: true })) },
      { phase: "Still to do", items: d.whatsLeft.map((title) => ({ title, done: false })) },
    ],
    risks: d.risks,
    planDrift: { hasPlan: false, aligned: true, notes: "" },
  };
}

function seedFiles(d: DemoProject, dir: string) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), d.site, "utf8");
  fs.writeFileSync(
    path.join(dir, "CLAUDE.md"),
    `# ${d.name}\n\n${d.tagline}\n\nThis is a simple, self-contained web page — all HTML/CSS/JS lives in index.html, with no build step. ` +
      `Open index.html in a browser to use it. Keep changes simple and clearly commented; a non-programmer may read this.\n`,
    "utf8"
  );
  fs.mkdirSync(path.join(dir, META_DIR), { recursive: true });
  fs.writeFileSync(plainSummaryPath(dir), d.plainSummary + "\n", "utf8");
  fs.writeFileSync(assessmentPath(dir), JSON.stringify(demoAssessment(d), null, 2), "utf8");
  writeTasks(dir, demoTasks(d));
}

function demoTasks(d: DemoProject): Task[] {
  const now = Date.now();
  return [
    ...d.done.map((t, i) => ({ id: `done-${i}`, title: t, status: "done" as const, createdAt: now, updatedAt: now })),
    ...d.whatsLeft.map((t, i) => ({ id: `todo-${i}`, title: t, status: "todo" as const, createdAt: now, updatedAt: now })),
  ];
}

/** Create the demo project on disk (idempotent — keeps any edits already made). */
export function materializeDemo(id: string): string {
  const d = byId(id);
  if (!d) throw new Error(`Unknown demo project: ${id}`);
  const dir = demoPathFor(id);
  if (fs.existsSync(path.join(dir, "index.html"))) {
    refreshDemoNotes(d, dir);
    return dir;
  }
  seedFiles(d, dir);
  const git = resolveGit();
  if (git) {
    try {
      execFileSync(git, ["init"], { cwd: dir, stdio: "ignore" });
      // Protégé's notes aren't part of the demo project, as in any other project.
      excludeNotesSync(git, dir);
      execFileSync(git, ["add", "-A"], { cwd: dir, stdio: "ignore" });
      execFileSync(
        git,
        ["-c", "user.name=Protégé", "-c", "user.email=protege@localhost", "commit", "-m", "Start of demo project"],
        { cwd: dir, stdio: "ignore" }
      );
    } catch {
      /* git optional */
    }
  }
  return dir;
}

/** Wipe a demo project back to its original starting point. */
export function resetDemo(id: string): string {
  const dir = demoPathFor(id);
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  return materializeDemo(id);
}

// --- Shaping into the app's data types ------------------------------------

export function demoSummaries(): ProjectSummary[] {
  const now = Date.now();
  const live = getJobManager().liveCountByPath();
  return DEMO.map((d) => {
    const dir = demoPathFor(d.id);
    return {
      id: d.id,
      path: dir,
      name: d.name,
      source: "registered" as const,
      sessionCount: d.history.length,
      lastActivity: now - d.lastActivityAgo,
      summary: d.tagline,
      plainSummaryLine: d.tagline,
      gitBranch: "main",
      tags: ["demo"],
      liveAgents: live[dir] || 0,
      tasks: { todo: d.whatsLeft.length, doing: live[dir] || 0, done: d.done.length },
      hasDesign: false,
      hasPlan: false,
      hasClaudeMd: true,
      exists: true,
    };
  });
}

export function demoDetail(id: string) {
  const d = byId(id);
  if (!d) return null;
  const dir = materializeDemo(id); // real folder — the agent can genuinely edit it
  const docs = readProjectDocs(dir);
  const assessment = readAssessment(dir);
  const plainSummary = readPlainSummary(dir);
  const jobs = getJobManager().jobsForProject(dir);
  const previewEntry = findPreviewEntry(dir);
  const tasks: Task[] = (docs.tasks as Task[]) || [];
  const done = tasks.filter((t) => t.status === "done").map((t) => t.title);
  const remaining = tasks.filter((t) => t.status !== "done").map((t) => t.title);
  const base = demoSummaries().find((p) => p.id === id)!;
  return {
    project: { ...base, path: dir },
    docs,
    sessions: [],
    jobs,
    assessment,
    plainSummary,
    progress: { done, remaining },
    gitRepo: true,
    previewEntry,
  };
}

export function demoSuggestions(id: string) {
  const d = byId(id);
  return d ? d.suggestions : [];
}

function excludeNotesSync(git: string, dir: string) {
  const file = path.join(dir, ".git", "info", "exclude");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const have = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  if (!have.split(/\r?\n/).includes(`/${META_DIR}/`)) {
    fs.appendFileSync(file, `${have && !have.endsWith("\n") ? "\n" : ""}/${META_DIR}/\n`);
  }
  void git;
}

/**
 * Bring an existing demo folder's notes up to date: the assessment (parts, diagram, reasons)
 * and checklist are rewritten when the assessment lacks parts, and notes that git tracked in older demos stop being tracked.
 */
function refreshDemoNotes(d: DemoProject, dir: string) {
  try {
    const current = readAssessment(dir);
    if (!current?.components?.length) {
      fs.mkdirSync(path.join(dir, META_DIR), { recursive: true });
      fs.writeFileSync(assessmentPath(dir), JSON.stringify(demoAssessment(d), null, 2), "utf8");
      // The checklist from the same, older version of the demo goes with it.
      writeTasks(dir, demoTasks(d));
    }
    const git = resolveGit();
    if (!git) return;
    const tracked = execFileSync(git, ["ls-files", "--", META_DIR], { cwd: dir }).toString().trim();
    if (tracked) {
      execFileSync(git, ["rm", "-r", "-q", "--cached", "--", META_DIR], { cwd: dir, stdio: "ignore" });
      excludeNotesSync(git, dir);
      execFileSync(git, ["-c", "user.name=Protégé", "-c", "user.email=protege@localhost", "commit", "-q", "-m", "Keep Protégé's notes out of the project"], {
        cwd: dir,
        stdio: "ignore",
      });
    }
  } catch {
    /* a demo still works without its notes */
  }
}
