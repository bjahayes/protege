import fs from "fs";
import path from "path";
import { metaPath } from "./meta";
import { readFileSafe, readTasks } from "./docs";
import { readAssessment } from "./assessment";
import { readPlainSummary } from "./plain-summary";
import { explainRules } from "./explain-style";

export interface Suggestion {
  kind: "do" | "ask";
  text: string;
}

export function suggestionsPath(dir: string): string {
  return metaPath(dir, "suggestions.json");
}

export function readSuggestions(dir: string): Suggestion[] | null {
  const raw = readFileSafe(suggestionsPath(dir));
  if (!raw) return null;
  try {
    const j = JSON.parse(raw);
    return Array.isArray(j.suggestions) ? j.suggestions : null;
  } catch {
    return null;
  }
}

export function writeSuggestions(dir: string, suggestions: Suggestion[]) {
  try {
    fs.mkdirSync(path.dirname(suggestionsPath(dir)), { recursive: true });
    fs.writeFileSync(suggestionsPath(dir), JSON.stringify({ suggestions, generatedAt: Date.now() }, null, 2), "utf8");
  } catch {
    /* ignore */
  }
}

export function buildSuggestionsContext(dir: string): string {
  const parts: string[] = [];
  const plain = readPlainSummary(dir);
  if (plain) parts.push(`Plain-English description:\n${plain.slice(0, 2000)}`);
  else {
    const a = readAssessment(dir);
    if (a) parts.push(`Summary: ${a.oneLiner}\nStatus: ${a.status?.slice(0, 500) || ""}`);
  }
  try {
    const todos = readTasks(dir).filter((t) => t.status === "todo").map((t) => t.title);
    if (todos.length) parts.push(`Open to-do items:\n- ${todos.slice(0, 8).join("\n- ")}`);
  } catch {
    /* ignore */
  }
  return parts.join("\n\n").slice(0, 3500);
}

export function buildSuggestionsPrompt(context: string): string {
  return (
    `Based on the project below, suggest 5 specific, genuinely useful things the user could ask the assistant to do, or ask about — tailored to THIS project.\n\n` +
    `Rules:\n` +
    `- Write each as a short, natural sentence a NON-TECHNICAL person (e.g. a lawyer) would actually say. No jargon.\n` +
    `- Mix practical tasks ("do") and helpful questions ("ask"). Be specific to this project, not generic.\n` +
    `- Good examples: "Add a summary at the top of the main document", "Explain what this project is for in simple terms", "Draft a first version of the missing section".\n` +
    `- Return ONLY a JSON array, no prose: [{"kind":"do"|"ask","text":"..."}]\n\n` +
    `PROJECT:\n${context || "(no description available yet)"}` +
    explainRules({ json: true })
  );
}
