import fs from "fs";
import path from "path";
import { computeRepoMap } from "./repomap";
import { readAssessment } from "./assessment";
import { getProjectBrain, listBrain } from "./brain";

export function buildAskSystemPrompt(): string {
  return [
    "You are Protégé, a friendly assistant that answers questions about ONE specific project, grounded in its actual files.",
    "You have READ-ONLY tools (Read, Grep, Glob) — use them to check the real files before answering. Never claim you changed anything — you can't.",
    "The reader may be non-technical. Write clearly and avoid jargon where you can; when you must name a file, name it plainly (e.g. the file called X).",
    "SHOW YOUR WORK: base every answer on what you actually read, and END your answer with a short section titled 'Where this comes from:' listing the specific documents/files (and sections, if relevant) you used. If you couldn't find something, say so plainly rather than guessing.",
    "Be concise and direct; expand only when asked.",
  ].join(" ");
}

function cap(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "\n…(truncated)" : s;
}

/** Pre-load orientation context so the assistant doesn't start blind. */
export function buildAskContext(dir: string): string {
  const parts: string[] = [];
  parts.push("# Context assembled for this project\n(Use it to orient, then read the real files to verify.)");

  // Repo map
  try {
    const map = computeRepoMap(dir);
    const top = map.files
      .slice(0, 28)
      .map((f) => `- ${f.path}${f.symbols.length ? `  — ${f.symbols.slice(0, 8).map((s) => s.name).join(", ")}` : ""}`)
      .join("\n");
    parts.push(
      `## Most central files (import-graph PageRank; ${map.scanned} scanned)\n${top}`
    );
  } catch {
    /* ignore */
  }

  // Assessment
  try {
    const a = readAssessment(dir);
    if (a) {
      const comps = (a.components || [])
        .slice(0, 12)
        .map((c) => `- ${c.name} (${c.path}) [${c.status}] — ${c.does}${c.issues?.length ? ` · issues: ${c.issues.slice(0, 2).join("; ")}` : ""}`)
        .join("\n");
      parts.push(
        `## Prior assessment\n${a.oneLiner}\nPhase: ${a.phase} · ~${a.completeness}% complete\nArchitecture: ${a.architecture?.description || ""}\nComponents:\n${comps}${a.risks?.length ? `\nRisks: ${a.risks.slice(0, 5).join("; ")}` : ""}`
      );
    }
  } catch {
    /* ignore */
  }

  // Brain
  try {
    const b = getProjectBrain(dir);
    if (b.matched && b.page) {
      const notes = b.notes.slice(0, 14).map((n) => `- ${n.title}${n.summary ? ` — ${n.summary}` : ""}`).join("\n");
      parts.push(`## From your second brain (brainchild)\n${b.page.meta.summary || ""}\nTechniques/decisions recorded:\n${notes}`);
    }
  } catch {
    /* ignore */
  }

  // Docs available
  const docs = ["README.md", "DESIGN.md", "PLAN.md", "CLAUDE.md"].filter((f) => {
    try {
      return fs.existsSync(path.join(dir, f));
    } catch {
      return false;
    }
  });
  if (docs.length) parts.push(`## Docs you can Read\n${docs.join(", ")}`);

  return cap(parts.join("\n\n"), 8000);
}

/** A compact orientation injected into every agent launch so it starts warm, not cold. */
export function buildLaunchContext(dir: string): string {
  const parts: string[] = [];
  try {
    const map = computeRepoMap(dir);
    const top = map.files
      .slice(0, 16)
      .map((f) => `- ${f.path}${f.symbols.length ? ` (${f.symbols.slice(0, 5).map((s) => s.name).join(", ")})` : ""}`)
      .join("\n");
    if (top) parts.push(`Most central files:\n${top}`);
  } catch {
    /* ignore */
  }
  try {
    const a = readAssessment(dir);
    if (a) {
      const comps = (a.components || []).slice(0, 10).map((c) => `${c.name} (${c.status})`).join(", ");
      parts.push(`This project: ${a.oneLiner} [${a.phase}, ~${a.completeness}%]. Components: ${comps}.`);
    }
  } catch {
    /* ignore */
  }
  if (!parts.length) return "";
  return cap(
    `# Orientation for this project (verify against the real files as needed)\n\n${parts.join("\n\n")}`,
    4500
  );
}

// ---- Global "Ask the brain" (across all projects + notes) ----

export function buildBrainAskSystemPrompt(): string {
  return [
    "You are Protégé, a knowledge assistant. You answer questions across ALL of the user's projects, drawing on their 'second brain' — a corpus of atomic markdown notes (techniques, decisions, frameworks, domain knowledge, tools) plus one page per project, all stored as markdown files in your current working directory (notes/ and projects/).",
    "Ground every answer in the actual notes: Grep/Read the files to find and confirm details before answering.",
    "ALWAYS cite the specific notes and projects you draw on, inline, using double-bracket slugs exactly like [[note-slug]] or [[project-slug]] — use the exact slugs from the index. Cite as you go, not just at the end.",
    "Be synthetic: connect ideas across projects, point out where the same technique recurs, and name the projects. Concise but substantive. If the brain doesn't cover something, say so.",
  ].join(" ");
}

export function buildBrainAskContext(): string {
  const idx = listBrain();
  if (!idx.available) return "The second brain is empty or unavailable.";

  const parts: string[] = [];
  parts.push(
    "# Index of the second brain\nUse it to know what exists and the exact slugs to cite. Grep/Read notes/ and projects/ for full content."
  );

  parts.push(
    `## Projects (${idx.projects.length})\n` +
      idx.projects
        .map((p) => `- [[${p.slug}]] ${p.title}${p.summary ? ` — ${p.summary.slice(0, 90)}` : ""}`)
        .join("\n")
  );

  const byCat = new Map<string, typeof idx.notes>();
  for (const n of idx.notes) {
    const c = n.category || "Notes";
    if (!byCat.has(c)) byCat.set(c, [] as any);
    byCat.get(c)!.push(n);
  }
  for (const [cat, notes] of byCat) {
    parts.push(
      `## ${cat} (${notes.length})\n` + notes.map((n) => `- [[${n.slug}]] ${n.title}`).join("\n")
    );
  }

  return cap(parts.join("\n\n"), 16000);
}
