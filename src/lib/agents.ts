// Client-safe. Protégé's agents: a named job with its own instructions, what it may change, and
// a version. Every run is a run of one agent, so the history says which agent did what.
//
// Four kinds, by what an agent may change:
//   document  keeps one document up to date (PLAN.md, DESIGN.md…) and may edit only that file.
//             Each run saves a new version of the document.
//   report    reads the project and writes a report (.protege/reports/<agent>.md), and may edit
//             only that file. Each run saves a new version of the report.
//   plan      reads the project and answers; changes nothing.
//   change    changes the project's files, on a safe copy when the project uses git.
//
// Built-in agents are defined here. People make their own on the Agents page (agent-store.ts).

export type AgentKind = "document" | "report" | "plan" | "change";

export interface AgentDef {
  id: string;
  name: string;
  emoji: string;
  group: string;
  /** One line, for the card. */
  summary: string;
  /** What it does and how, in plain words, for the agent's page. */
  description: string;
  kind: AgentKind;
  /** For document and report agents: the file it keeps, relative to the project folder. */
  document?: string;
  /** Asks the person for something before it runs ("What should change?"). */
  input?: { label: string; placeholder: string; required: boolean };
  /** The instructions Claude is given. {input} is replaced by what the person typed. */
  instructions: string;
  builtIn: boolean;
  version: number;
  updatedAt?: number;
  /** Runs through Protégé's own assessment or summary code instead of these instructions. */
  special?: "map" | "plain-summary";
}

export const GROUPS = [
  { key: "docs", title: "Keep the documents up to date", blurb: "Each one looks after one document and saves a new version every time it runs." },
  { key: "check", title: "Check it", blurb: "They read the project and write a report. They don't change the project." },
  { key: "work", title: "Plan and make changes", blurb: "Changes are made on a safe copy and shown to you before anything is kept." },
  { key: "mine", title: "Your agents", blurb: "Agents you've made." },
];

const PLAIN =
  "Write for a reader who doesn't write code, such as a lawyer: plain English, short sentences, no jargon " +
  "(explain any technical term the first time you use it), and say what each thing means for them.";

/** The rules a document agent works under, around its task. */
export const DOC = (file: string, task: string) =>
  `${task}\n\nYou may edit only ${file}; don't change any other file. Read whatever you need: the code, ` +
  `the other documents (DESIGN.md, PLAN.md, CLAUDE.md, README.md) and Protégé's notes in .protege/. ` +
  `Keep what in ${file} is still true, correct what isn't, and add what's missing. If ${file} doesn't ` +
  `exist yet, create it. Finish by saying in two or three sentences what you changed and why.`;

/** The rules a report agent works under, around its task. */
export const REPORT = (file: string, task: string) =>
  `${task}\n\nDon't change the project. Write your report to ${file} (create the folder if needed); ` +
  `that's the only file you may edit. Start the report with a short summary of what you found, then ` +
  `the details, most important first, each with where in the project it is. ${PLAIN} ` +
  `Finish by giving the summary in your reply as well.`;

const report = (id: string) => `.protege/reports/${id}.md`;

export const BUILT_IN_AGENTS: AgentDef[] = [
  // Keep the documents up to date
  {
    id: "update-plan",
    name: "Update the plan",
    emoji: "🗺️",
    group: "docs",
    summary: "Brings PLAN.md into line with what's built and what's next.",
    description:
      "Reads the code, the task list and the current plan, then updates PLAN.md: marks what's done, notes what's in progress, and lays out the next steps in order. It changes nothing but PLAN.md.",
    kind: "document",
    document: "PLAN.md",
    instructions: DOC(
      "PLAN.md",
      "Update this project's plan, PLAN.md. Work out from the code and the task list (.protege/tasks.json) what has been built, what is in progress and what remains. The plan should say, in order: the goal, the phases or steps, which are done, which are in progress, and what comes next, each step small enough to do in one sitting."
    ),
    builtIn: true,
    version: 1,
  },
  {
    id: "update-design",
    name: "Update the design",
    emoji: "📐",
    group: "docs",
    summary: "Keeps DESIGN.md describing how the project actually works.",
    description:
      "Reads the code and updates DESIGN.md so it describes how the project really works: what it's for, its main parts, how they fit together, and the important decisions and why. It changes nothing but DESIGN.md.",
    kind: "document",
    document: "DESIGN.md",
    instructions: DOC(
      "DESIGN.md",
      "Update this project's design document, DESIGN.md, so it matches the code as it is now. Cover: what the project is for and who uses it, its main parts and what each does, how they fit together and how information flows between them, where data is kept, and the important design decisions with the reason for each."
    ),
    builtIn: true,
    version: 1,
  },
  {
    id: "update-claude-md",
    name: "Update Claude's notes",
    emoji: "🧭",
    group: "docs",
    summary: "Updates CLAUDE.md so a new Claude session gets going quickly.",
    description:
      "CLAUDE.md is what Claude reads first whenever it works in this project. This agent checks it against the project and updates it: how to run and test it, how the code is laid out, its conventions and its pitfalls. It changes nothing but CLAUDE.md.",
    kind: "document",
    document: "CLAUDE.md",
    instructions: DOC(
      "CLAUDE.md",
      "Update CLAUDE.md, the notes Claude reads first when it works in this project, so a fresh session could get productive quickly: how to install, run, build and test the project; how the code is laid out; its conventions; and the pitfalls and lessons learned. Keep it concise."
    ),
    builtIn: true,
    version: 1,
  },
  {
    id: "user-guide",
    name: "Write the user guide",
    emoji: "📘",
    group: "docs",
    summary: "Writes GUIDE.md: how to use the project, step by step, for non-technical people.",
    description:
      "Works out what the project does for the people who use it, and writes GUIDE.md: what it's for, how to start it, and how to do each main thing, step by step, in plain English. It changes nothing but GUIDE.md.",
    kind: "document",
    document: "GUIDE.md",
    instructions: DOC(
      "GUIDE.md",
      `Write a user guide for this project in GUIDE.md, for the people who will use it, not the people who build it. Cover: what it's for, how to open or start it, and how to do each main thing it offers, as numbered steps, with what they'll see. ${PLAIN}`
    ),
    builtIn: true,
    version: 1,
  },
  {
    id: "changes",
    name: "Explain what changed",
    emoji: "📰",
    group: "docs",
    summary: "Keeps CHANGES.md: a plain-English record of what changed and when.",
    description:
      "Reads the project's saved history (its git log), which Protégé hands it, and keeps CHANGES.md up to date: what changed, when, and what it means for the people using it, newest first. It changes nothing but CHANGES.md.",
    kind: "document",
    document: "CHANGES.md",
    instructions: DOC(
      "CHANGES.md",
      `Keep a plain-English record of changes in CHANGES.md, newest first, grouped by date. The project's saved history is below. For each change say what it means for the people who use the project, not how it was coded. Add entries for anything newer than what's already there. ${PLAIN}`
    ),
    builtIn: true,
    version: 1,
  },
  {
    id: "plain-summary",
    name: "Write a plain-English summary",
    emoji: "📄",
    group: "docs",
    summary: "Explains what the project is and where it's up to, for a non-technical reader.",
    description:
      "Reads the project and writes the plain-English summary shown on the project's page: what it is, who it's for, what works and what's left to do.",
    kind: "document",
    document: ".protege/plain-summary.md",
    instructions: "",
    special: "plain-summary",
    builtIn: true,
    version: 1,
  },
  {
    id: "map",
    name: "Map the project",
    emoji: "🧩",
    group: "docs",
    summary: "Works out the project's parts, how they connect, and how far along each one is.",
    description:
      "Reads the code and works out the main parts of the project, how they connect and how far along each one is, with the reason for each label. That's what the \"How it fits together\" diagram shows. It only reads the code; it doesn't run anything.",
    kind: "document",
    document: ".protege/assessment.json",
    instructions: "",
    special: "map",
    builtIn: true,
    version: 1,
  },

  // Check it
  {
    id: "review",
    name: "Look for problems",
    emoji: "🔍",
    group: "check",
    summary: "Finds bugs, security holes and things that could go wrong, most serious first.",
    description:
      "Reads the code looking for things that are wrong or could go wrong: mistakes, security holes, ways data could be lost, and things that would break with real use. It writes a report, most serious first, and changes nothing in the project.",
    kind: "report",
    document: report("review"),
    instructions: REPORT(
      report("review"),
      "Review this project for problems: bugs, security holes, ways information could be lost or exposed, and things that would break in real use. For each, say what could happen, how likely and how serious it is, and what would fix it."
    ),
    builtIn: true,
    version: 1,
  },
  {
    id: "privacy",
    name: "Check privacy and confidentiality",
    emoji: "🔒",
    group: "check",
    summary: "What information it collects, where it's kept, where it's sent, and who could see it.",
    description:
      "Traces the information the project handles: what it collects, where it stores it, whether anything is sent outside the computer (and to whom), how long it's kept, and who could see it. Useful before using it with client or confidential material. It changes nothing in the project.",
    kind: "report",
    document: report("privacy"),
    instructions: REPORT(
      report("privacy"),
      "Check how this project handles information, as if advising someone about to use it with confidential client material. List: what information it collects or reads; where it stores it and in what form; anything it sends outside this computer (which service, what is sent, when); what it logs; how long anything is kept and how it is deleted; and who else could see it. Flag anything that would worry a careful lawyer."
    ),
    builtIn: true,
    version: 1,
  },
  {
    id: "licences",
    name: "Check open-source licences",
    emoji: "⚖️",
    group: "check",
    summary: "Lists the outside code it uses, each one's licence, and what that licence requires.",
    description:
      "Lists the third-party code the project relies on, the licence of each, and what those licences require (keeping notices, sharing source code, restrictions on use). It flags any that could cause trouble for how the project is used or shared. It changes nothing in the project.",
    kind: "report",
    document: report("licences"),
    instructions: REPORT(
      report("licences"),
      "List the third-party packages and code this project depends on (from its package files, lock files and any copied-in code), with the licence of each. Group them by licence. Explain what each licence requires (attribution, keeping licence notices, sharing source code, patent terms) and flag any copyleft or unusual licences that could matter if the project is shared or sold. Say where the information came from and what you couldn't confirm."
    ),
    builtIn: true,
    version: 1,
  },
  {
    id: "wording",
    name: "Check the wording",
    emoji: "✍️",
    group: "check",
    summary: "Reads every message and label people see, for spelling, clarity and consistent terms.",
    description:
      "Reads all the text the project shows people (labels, messages, instructions, errors) and reports spelling mistakes, unclear or jargon-heavy wording, inconsistent terms and anything that could mislead, with a suggested rewrite for each. It changes nothing; the \"Make a change\" agent can apply the fixes.",
    kind: "report",
    document: report("wording"),
    instructions: REPORT(
      report("wording"),
      "Find all the text this project shows the people using it (page text, labels, buttons, messages, errors, emails or documents it produces). Report spelling and grammar mistakes, unclear or jargon-heavy wording, the same thing called by different names, and anything that could mislead. For each, give where it is, the current text, and a suggested rewrite."
    ),
    builtIn: true,
    version: 1,
  },
  {
    id: "try-it",
    name: "Try it like a new user",
    emoji: "🧪",
    group: "check",
    summary: "Walks through what a first-time user would do, and reports where they'd get stuck.",
    description:
      "Works out what a first-time user would do with the project and walks through each step by reading the code. It reports where someone would get stuck, confused or lose work, and what would help. It changes nothing in the project.",
    kind: "report",
    document: report("try-it"),
    instructions: REPORT(
      report("try-it"),
      "Act as a first-time, non-technical user of this project. Work out the main things they'd want to do and walk through each one step by step, from the code. Report every point where they'd be stuck, confused, unsure what happened, or could lose work, and suggest what would help."
    ),
    builtIn: true,
    version: 1,
  },

  // Plan and make changes
  {
    id: "plan-change",
    name: "Plan a change",
    emoji: "📝",
    group: "work",
    summary: "Works out how to make a change, step by step, without changing anything.",
    description:
      "Reads the project and works out how to make the change you describe: the steps, the files involved, and the risks. It changes nothing, so you can read the plan before deciding.",
    kind: "plan",
    input: { label: "What change do you want?", placeholder: "e.g. Add a due date to each item in the checklist", required: true },
    instructions:
      "Read DESIGN.md, PLAN.md and CLAUDE.md if present, and the relevant code. Then write a step-by-step plan for the change below: what to change, in which files, in what order, and the risks. Don't change anything.\n\nThe change: {input}",
    builtIn: true,
    version: 1,
  },
  {
    id: "make-change",
    name: "Make a change",
    emoji: "🛠️",
    group: "work",
    summary: "Makes the change you describe, then checks it works.",
    description:
      "Makes the change you describe, keeping to the project's existing style, then runs the project's checks if it has any. Where the project uses git, it works on a safe copy and shows you the changes before anything is kept.",
    kind: "change",
    input: { label: "What should change?", placeholder: "e.g. Add a field for the client's reference number", required: true },
    instructions:
      "Make the following change. Keep it scoped and consistent with the existing code and the conventions in CLAUDE.md. Run any relevant tests when done and report, in plain words, what you changed.\n\nThe change: {input}",
    builtIn: true,
    version: 1,
  },
  {
    id: "fix-problem",
    name: "Fix a problem",
    emoji: "🩹",
    group: "work",
    summary: "Finds the cause of something that's going wrong and fixes it.",
    description:
      "Investigates the problem you describe, finds its cause, fixes it, and checks the fix. It explains what was wrong in plain words. Where the project uses git, it works on a safe copy.",
    kind: "change",
    input: { label: "What's going wrong?", placeholder: "e.g. The letter's date shows in American format", required: true },
    instructions:
      "Something is going wrong in this project. Find the cause before changing anything, then fix the cause (not just the symptom), and check the fix works. Explain in plain words what was wrong and what you changed.\n\nThe problem: {input}",
    builtIn: true,
    version: 1,
  },
];

/** The instructions for one run, with the person's input filled in. */
export function instructionsFor(a: AgentDef, input?: string): string {
  const text = (input || "").trim();
  if (a.instructions.includes("{input}")) return a.instructions.replace(/\{input\}/g, text);
  return text ? `${a.instructions}\n\nAlso: ${text}` : a.instructions;
}

/** What an agent may change, in a sentence. */
export function changesText(a: AgentDef): string {
  if (a.kind === "document" || a.kind === "report") return `Changes only ${a.document}, and saves a new version of it each run.`;
  if (a.kind === "plan") return "Changes nothing.";
  return "Changes the project's files, on a safe copy when the project uses git.";
}

/** The agent a run was, for showing it: the recorded one, or worked out for runs from before agents. */
export function runAgentLabel(j: { agentId?: string; agentName?: string; kind?: string; prompt: string }, agents: AgentDef[] = BUILT_IN_AGENTS): { name: string; emoji: string } {
  const a = j.agentId ? agents.find((x) => x.id === j.agentId) : undefined;
  if (a) return { name: j.agentName || a.name, emoji: a.emoji };
  if (j.agentName) return { name: j.agentName, emoji: "🤖" };
  const byId = (id: string) => BUILT_IN_AGENTS.find((x) => x.id === id)!;
  const p = j.prompt.trimStart();
  if (p.startsWith("You are performing a STRUCTURED PROJECT ASSESSMENT")) return byId("map");
  if (p.startsWith("Write a plain-English summary")) return byId("plain-summary");
  if (p.startsWith("This is a brand-new project started from")) return { name: "Shape a new project", emoji: "✨" };
  return { name: "Your own instruction", emoji: "💬" };
}

/**
 * A run's title for lists: the person's own words, or, for a run Protégé started itself (an agent,
 * the project map, the plain summary, noting what was learned), what it was in plain words. Protégé's
 * long instructions to Claude never show as a title.
 */
export function runTitle(j: { agentId?: string; agentName?: string; kind?: string; prompt: string }, agents: AgentDef[] = BUILT_IN_AGENTS): string {
  const p = String(j.prompt || "").trimStart();
  if (j.kind === "assess" || p.startsWith("You are performing a STRUCTURED PROJECT ASSESSMENT")) return "Drew a map of the project";
  if (p.startsWith("Write a plain-English summary")) return "Wrote the plain-English summary";
  if (p.startsWith("A task was just completed in this project")) return "Noted what was learned for next time";
  if (p.startsWith("This is a brand-new project started from")) return "Shaped the new project";
  const a = j.agentId ? agents.find((x) => x.id === j.agentId) : undefined;
  // An agent that takes the person's words ("What should change?") is titled by them; one that doesn't, by its name.
  const own = p.split("\n\n---\nIMPORTANT")[0].trim();
  if (a && !a.input) return a.name;
  if (a?.input) {
    const [before, after] = a.instructions.split("{input}");
    let t = own;
    if (before.trim() && t.startsWith(before.trim())) {
      t = t.slice(before.trim().length);
      // Whatever follows the person's words (the rest of the template, rules for the agent's kind).
      const tail = after?.trim() ? t.indexOf(after.trim().slice(0, 30)) : -1;
      t = tail > 0 ? t.slice(0, tail) : t.split("\n\n")[0];
    }
    return t.trim() || a.name;
  }
  if (j.agentName && !own) return j.agentName;
  return own || "(no instruction)";
}

/** Whether a Claude Code session's first message is one Protégé wrote, not the person. */
export function isProtegePrompt(text: string | undefined): boolean {
  const p = String(text || "").trimStart();
  return (
    p.startsWith("You are performing a STRUCTURED PROJECT ASSESSMENT") ||
    p.startsWith("Write a plain-English summary of THIS project") ||
    p.startsWith("A task was just completed in this project") ||
    p.startsWith("This is a brand-new project started from") ||
    BUILT_IN_AGENTS.some((a) => !a.input && a.instructions.length > 40 && p.startsWith(a.instructions.slice(0, 60)))
  );
}

/** An agent's own task, without the rules Protégé adds for its kind (for making a copy of it). */
export function taskOnly(a: AgentDef): string {
  const i = a.instructions;
  const cut = [i.indexOf("\n\nYou may edit only "), i.indexOf("\n\nDon't change the project. Write your report")].filter((n) => n > 0);
  return cut.length ? i.slice(0, Math.min(...cut)) : i;
}
