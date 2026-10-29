// Checks the context panel's pure pieces with made-up runs (no model calls, no browser):
//   npm run test:panel
// The replay strip's stretches, the plan block a plan-first run ends with, and the grouping
// of a change into steps by part.
import { replaySegments, replayTotals, goingInCircles, plainDuration, workingTime } from "../src/lib/replay.ts";
import { parsePlan, stripPlan, matchPart } from "../src/lib/plan.ts";
import { partsForFiles } from "../src/lib/live-build.ts";
import { splitEdits, assembleSteps, groupingPrompt } from "../src/lib/story-steps.ts";
import { turns, lastTurn, chatEvents, turnTimes, storyFiles, pendingPlan, planLines, turnPlan, turnLabel } from "../src/lib/chat-panel.ts";
import { collectChanges } from "../src/lib/chat-changes.ts";
import { todosFrom, todoProgress, chatTodoSteps, jobTodoSteps } from "../src/lib/todo-list.ts";

let failures = 0;
const check = (ok: boolean, what: string) => {
  console.log(`${ok ? "pass" : "FAIL"}  ${what}`);
  if (!ok) failures++;
};

// --- Replay strip ---------------------------------------------------------------------------
let seq = 0;
const ev = (ts: number, type: string, payload: any = {}) => ({ seq: seq++, ts, type, payload });
const run = [
  ev(0, "status", { status: "running" }),
  ev(1000, "tool", { name: "Read", detail: { file: "/p/index.html" } }),
  ev(3000, "tool", { name: "Grep", detail: { pattern: "deadline" } }),
  ev(5000, "tool", { name: "Edit", detail: { file: "/p/index.html", added: 3, removed: 1 } }),
  ev(6000, "tool_result", { text: "ok" }),
  ev(8000, "tool", { name: "Bash", detail: { command: "npm test", description: "Run the tests" } }),
  ev(9000, "tool_result", { text: "1 failing", isError: true }),
  ev(10000, "tool", { name: "Edit", detail: { file: "/p/index.html", added: 1, removed: 1 } }),
  ev(11000, "checks", { passed: true, command: "npm test" }),
  ev(12000, "result", { subtype: "success", result: "Done" }),
];
const segs = replaySegments(run, 12000);
check(segs.map((s) => s.kind).join(",") === "reading,changing,running,problem,changing,running", `stretches follow the run (${segs.map((s) => s.kind).join(",")})`);
check(segs[0].start === 1000 && segs[0].end === 5000, "a stretch lasts until the next one starts");
check(segs[segs.length - 1].end === 12000, "the last stretch runs to the end of the run");
check(segs[0].steps.join("|") === "Read index.html|Searched the files for “deadline”", "a stretch lists its steps in plain words");
const totals = replayTotals(segs);
check(totals.reading === 4000 && totals.problem === 1000, "time is added up for each kind");
check(Object.values(totals).reduce((a, b) => a + b, 0) === 11000, "the stretches cover the whole run from its first step");
check(!goingInCircles(segs), "one problem isn't going round in circles");
const loop = [ev(0, "tool", { name: "Bash" })];
for (let i = 1; i <= 4; i++) loop.push(ev(i * 10, "tool_result", { isError: true }), ev(i * 10 + 5, "tool", { name: "Bash" }));
check(goingInCircles(replaySegments(loop, 100)), "problems coming back again and again are going round in circles");
check(replaySegments([], 5).length === 0, "a run with no steps yet has no stretches");
check(plainDuration(45_000) === "45 sec" && plainDuration(180_000) === "3 min" && plainDuration(3_900_000) === "1 hr 5 min", "durations read plainly");

// --- Plan block --------------------------------------------------------------------------------
const reply =
  "I'll add a reminder.\n\n1. Work out the dates\n2. Send the email\n\n```protege-plan\n" +
  JSON.stringify({ steps: ["Work out the dates", "Send the email"], parts: [{ name: "date checker", change: "change", what: "x" }, { name: "Reminder emails", change: "new", what: "Sends reminders" }] }) +
  "\n```";
const plan = parsePlan(reply);
check(!!plan && plan.steps.length === 2 && plan.parts.length === 2, "a plan's block is read");
check(plan?.parts[1].change === "new", "a new part is marked new");
check(!stripPlan(reply).includes("protege-plan") && stripPlan(reply).startsWith("I'll add a reminder."), "the chat shows the plan without its block");
check(parsePlan("No block here") === null && parsePlan("```protege-plan\n{not json\n```") === null, "a reply without a readable block has no plan");
check(matchPart("date checker", ["Date Checker", "Intake page"]) === "Date Checker", "plan names match parts ignoring case");
check(matchPart("Reminder emails", ["Date Checker", "Intake page"]) === null, "a new part matches nothing on the map");

// --- Grouping by part ----------------------------------------------------------------------------
const comps: any[] = [
  { name: "Intake page", path: "src/intake/**", what: "", does: "", status: "solid", issues: [] },
  { name: "Date checker", path: "src/dates.ts", what: "", does: "", status: "solid", issues: [] },
];
check([...partsForFiles(comps, ["src/intake/form.html"])].join() === "Intake page", "a file goes with the part whose folder holds it");
check([...partsForFiles(comps, ["README.md"])].length === 0, "a file outside every part has no part");

// --- Steps by purpose ----------------------------------------------------------------------------
// The demo deadline tracker's change: one file, and every block of it mixes the two features.
const patch = [
  "diff --git a/index.html b/index.html",
  "index 111..222 100644",
  "--- a/index.html",
  "+++ b/index.html",
  "@@ -8,2 +8,4 @@",
  " .late{color:red}",
  "+.count{color:#445}",
  "+.remind{background:#fff7ed}",
  " .bar{height:6px}",
  "@@ -11,2 +13,4 @@",
  " <p class=sub>Days</p>",
  '+<p class="count" id="count"></p>',
  '+<div class="remind" id="soon"></div>',
  " <table>",
  "@@ -15,2 +19,6 @@",
  " const M=[];",
  "+",
  "+document.getElementById('count').textContent=M.length+' matters listed';",
  "+",
  "+const dueSoon=M.filter(x=>x.days<=7);",
  "-// old",
].join("\n");
const files = [
  { path: "index.html", status: "M", additions: 8, deletions: 1, patch },
  { path: "src/dates.ts", status: "A", additions: 2, deletions: 0, patch: "diff --git a/src/dates.ts b/src/dates.ts\nnew file mode 100644\n--- /dev/null\n+++ b/src/dates.ts\n@@ -0,0 +1,2 @@\n+a\n+b" },
  { path: "logo.png", status: "A", additions: 0, deletions: 0, patch: "Binary files differ" },
];
const edits = splitEdits(files as any);
const shown = (e: (typeof edits)[number]) => e.lines.map((l) => l.op + l.text.trim()).join("¦");
check(edits.length === 10, `a small change is cut line by line (${edits.length} edits: ${edits.map(shown).join(" / ")})`);
check(new Set(edits.map((e) => e.id)).size === edits.length, "every edit has its own id");
check(edits.some((e) => shown(e) === "+¦+document.getElementById('count').textContent=M.length+' matters listed';¦+"), "blank lines go with a neighbouring edit, not on their own");
check(edits[edits.length - 1].lines.length === 0 && edits[edits.length - 1].file.path === "logo.png", "a file with no text to show is one edit");
const id = (needle: string) => edits.find((e) => e.lines.some((l) => l.text.includes(needle)))!.id;
const steps = assembleSteps(
  edits,
  [
    { title: "Counted the matters", plain: "A line says how many.", edits: [id(".count"), id('class="count"'), id("matters listed")] },
    { title: "Added the reminder box", plain: "Shows what's due soon.", edits: [id(".remind"), id('class="remind"'), id("dueSoon"), id("matters listed"), "nope", edits.find((e) => e.file.path === "src/dates.ts")!.id] },
  ],
  comps
);
const countPatch = steps[0].files[0].patch || "";
check(countPatch.includes(".count{") && countPatch.includes("matters listed") && !countPatch.includes("remind"), "a step's code shows only its own lines, even when git put two features in one block");
check(steps[0].files[0].additions === 3 + 2, `a step counts only its own lines (${steps[0].files[0].additions} added)`);
check(steps.length === 3 && steps[2].title === "Other small changes", "edits the model left out go in Other small changes");
check(steps.flatMap((s) => s.files).reduce((n, f) => n + f.additions + f.deletions, 0) === 8 + 1 + 2, "every changed line is in exactly one step");
check(steps[0].part === undefined && steps[1].part === "Date checker", "a step is marked on the part most of its lines belong to");
check(assembleSteps(edits, [], comps).length === 1 && assembleSteps(edits, [], comps)[0].title === "The changes", "with no grouping at all, every edit is still shown");
const prompt = groupingPrompt("Add a count and a reminder", "Done", edits);
check(edits.every((e) => prompt.includes(`${e.id}:`)) && prompt.includes("In index.html (changed):"), "the model sees every edit by its id, under its file");
const big = splitEdits([{ path: "big.js", status: "M", additions: 200, deletions: 0, patch: "--- a\n+++ b\n@@ -1 +1,200 @@\n" + Array.from({ length: 200 }, (_, i) => (i % 50 === 49 ? "+" : `+line ${i}`)).join("\n") }] as any);
check(big.length === 4, `a big change is cut into runs of lines at blank lines (${big.length} edits)`);

// --- The Code page's conversations ------------------------------------------------------------
const chat: any[] = [
  { id: "u1", kind: "user", text: "Add a count", ts: 1000 },
  { id: "t1", kind: "tool", toolUseId: "a", name: "Read", input: { file_path: "C:/p/index.html" }, ts: 2000 },
  { id: "r1", kind: "tool_result", toolUseId: "a", text: "…", ts: 2500 },
  { id: "t2", kind: "tool", toolUseId: "b", name: "Edit", input: { file_path: "C:/p/index.html", old_string: "<h1>X</h1>", new_string: "<h1>X</h1>\n<p>4 listed</p>" }, ts: 3000 },
  { id: "r2", kind: "tool_result", toolUseId: "b", text: "ok", ts: 3500 },
  { id: "t3", kind: "tool", toolUseId: "c", name: "Bash", input: { command: "npm test", description: "Run the tests" }, ts: 4000 },
  { id: "r3", kind: "tool_result", toolUseId: "c", text: "1 failing", isError: true, ts: 5000 },
  { id: "x1", kind: "text", text: "Added the count.", ts: 6000 },
  { id: "e1", kind: "result", isError: false, ts: 7000 },
  { id: "u2", kind: "user", text: "Now plan a reminder", ts: 8000 },
  { id: "p1", kind: "permission", requestId: "q1", toolName: "ExitPlanMode", input: { plan: "## Plan\n1. Work out the dates\n2. **Show** the box\n- Test it" }, ts: 9000 },
];
check(turns(chat).length === 2 && lastTurn(chat)[0].id === "u2", "a conversation splits into turns at each message the person sent");
const midTurn: any[] = [
  { id: "a", kind: "user", text: "Restyle the cards", ts: 1 },
  { id: "b", kind: "tool", toolUseId: "e1", name: "Edit", input: { file_path: "C:/p/src/components/Card.tsx", old_string: "a", new_string: "b" }, ts: 2 },
  { id: "c", kind: "tool_result", toolUseId: "e1", text: "ok", ts: 3 },
  { id: "d", kind: "user", text: "and make them rounder", ts: 4, midTurn: true },
  { id: "e", kind: "tool", toolUseId: "r1", name: "Read", input: { file_path: "C:/p/src/app/page.tsx" }, ts: 5 },
];
const working = lastTurn(midTurn);
check(working[0].id === "a" && working.length === 5, "a message sent while Claude is working joins the turn in progress");
check(
  collectChanges(working, new Map([["e1", midTurn[2]]]), "C:/p").map((f) => f.rel).join() === "src/components/Card.tsx",
  "so the parts it changed before the message still show as being changed"
);
const ev1 = chatEvents(turns(chat)[0]);
const strip = replaySegments(ev1, 7000).map((s) => s.kind).join(",");
check(strip === "reading,changing,running,problem", `a chat turn plays out on the replay strip (${strip})`);
check(turnTimes(turns(chat)[0]).startedAt === 1000 && turnTimes(turns(chat)[0]).endedAt === 7000, "a turn runs from the message to its result");
check(chatEvents([{ id: "a", kind: "tool", toolUseId: "z", name: "Read", input: {} }] as any)[0].ts === 0, "an item without a time doesn't break the strip");
const changes = collectChanges(chat, new Map(chat.filter((i) => i.kind === "tool_result").map((i) => [i.toolUseId, i])), "C:/p");
const sf = storyFiles(changes);
check(sf.length === 1 && sf[0].path === "index.html" && sf[0].patch!.includes("+<p>4 listed</p>"), "Claude's edits become files with patches for the story");
check(splitEdits(sf).length === 1, "and the story can cut them into edits");
const pp = pendingPlan(chat);
check(pp?.requestId === "q1", "a plan waiting for approval is found");
check(pendingPlan([...chat, { id: "d", kind: "permission_done", requestId: "q1", decision: "allow" }]) === null, "an approved plan isn't waiting");
check(planLines(pp!.plan).join("|") === "Work out the dates|Show the box|Test it", `a plan's own lines are shown at once (${planLines(pp!.plan).join("|")})`);

const saved: any[] = [
  { id: "1", kind: "user", text: "First ask" },
  { id: "2", kind: "tool", toolUseId: "x", name: "Read", input: {} },
  { id: "3", kind: "tool_result", toolUseId: "x", text: "" },
  { id: "4", kind: "text", text: "Done the first." },
  { id: "5", kind: "user", text: "Second ask" },
  { id: "6", kind: "tool", toolUseId: "y", name: "Read", input: {} },
  { id: "7", kind: "user", text: "also this, while you work" },
  { id: "8", kind: "text", text: "Done the second." },
];
check(turns(saved).map((t) => t[0].id).join() === "1,5", "a saved session (no turn-finished markers) splits where a message follows Claude's reply");
const live: any[] = [...saved, { id: "9", kind: "user", text: "Third ask" }, { id: "10", kind: "text", text: "Looking now." }, { id: "11", kind: "user", text: "and add this", midTurn: true }];
check(turns(live).map((t) => t[0].id).join() === "1,5,9", "while Claude works, a message after its narration still joins the turn running now");
check(turnPlan(chat) === pp!.plan && turnPlan(turns(chat)[0]) === null, "a turn's plan is found, approved or not, and a turn without one has none");
check(turnLabel(turns(chat)[1]) === "Now plan a reminder", "a turn is labelled by what the person asked");

const idle = replaySegments(
  [ev(0, "tool", { name: "Read" }), ev(60_000, "tool", { name: "Edit" }), ev(30 * 86_400_000, "tool", { name: "Read" }), ev(30 * 86_400_000 + 5000, "tool", { name: "Read" })],
  30 * 86_400_000 + 5000
);
check(workingTime(idle) === 65_000, `a long idle gap (a session picked up again a month later) isn't counted as working time (${workingTime(idle)} ms)`);

// --- The live to-do list ----------------------------------------------------------------------
const tchat: any[] = [
  { id: "u0", kind: "user", text: "Earlier work" },
  { id: "c0", kind: "tool", toolUseId: "k0", name: "TaskCreate", input: { subject: "Old item" } },
  { id: "r0", kind: "tool_result", toolUseId: "k0", text: "Task #1 created successfully: Old item" },
  { id: "x0", kind: "text", text: "Done." },
  { id: "u1", kind: "user", text: "Add a reminder box" },
  { id: "c1", kind: "tool", toolUseId: "k1", name: "TaskCreate", input: { subject: "Work out the dates" } },
  { id: "c2", kind: "tool", toolUseId: "k2", name: "TaskCreate", input: { subject: "Show the box" } },
  { id: "r1", kind: "tool_result", toolUseId: "k1", text: "Task #2 created successfully: Work out the dates" },
  { id: "r2", kind: "tool_result", toolUseId: "k2", text: "Task #3 created successfully: Show the box" },
  { id: "c3", kind: "tool", toolUseId: "k3", name: "TaskUpdate", input: { taskId: "2", status: "completed" } },
  { id: "c4", kind: "tool", toolUseId: "k4", name: "TaskUpdate", input: { taskId: "3", status: "in_progress" } },
];
const tl = todosFrom(chatTodoSteps(tchat, lastTurn(tchat)));
check(tl.map((t) => `${t.text}:${t.status}`).join("|") === "Work out the dates:completed|Show the box:in_progress", `the turn's own to-do list, with what's done and what it's doing now (${tl.map((t) => t.text + ":" + t.status).join("|")})`);
check(todoProgress(tl).done === 1 && todoProgress(tl).current?.text === "Show the box", "it says how far along the list is");
const tw = todosFrom([
  { name: "TodoWrite", input: { todos: [{ content: "A", status: "completed" }, { content: "B", status: "pending" }] }, inTurn: true },
  { name: "TodoWrite", input: { todos: [{ content: "A", status: "completed" }, { content: "B", status: "in_progress" }] }, inTurn: true },
]);
check(tw.map((t) => t.status).join() === "completed,in_progress", "the older to-do tool (the whole list each time) is read too");
const jobRuns = [
  [
    { type: "tool", payload: { name: "TaskCreate", detail: { subject: "One" } } },
    { type: "tool", payload: { name: "Read", detail: {} } },
    { type: "tool", payload: { name: "TaskCreate", detail: { subject: "Two" } } },
    { type: "tool_result", payload: { text: "Task #4 created successfully: One" } },
    { type: "tool_result", payload: { text: "file contents" } },
    { type: "tool_result", payload: { text: "Task #5 created successfully: Two" } },
    { type: "tool", payload: { name: "TaskUpdate", detail: { taskId: "5", status: "completed" } } },
  ],
];
const jl = todosFrom(jobTodoSteps(jobRuns));
check(jl.map((t) => `${t.id}:${t.status}`).join() === "4:pending,5:completed", "a Simple task's list matches answers to their steps even when they're asked together");

console.log(failures ? `\n${failures} failed` : "\nAll passed");
process.exit(failures ? 1 : 0);
