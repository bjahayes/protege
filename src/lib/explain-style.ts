// Server-only. How Protégé explains things to the person: in everyday plain English (the default),
// or in Simplified Technical English (ASD-STE100), a controlled form of English made for technical
// documents that people must understand exactly, including readers whose first language isn't English.
// The choice is kept in data/settings.json and every prompt whose words the person reads adds the
// rules below (summaries, answers, the guide, plans, what changed, task reports, the parts map).
import fs from "fs";
import path from "path";
import { DATA_DIR } from "./config";

export type ExplainStyle = "plain" | "ste";

const FILE = path.join(DATA_DIR, "settings.json");

function readSettings(): Record<string, unknown> {
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf8"));
  } catch {
    return {};
  }
}

export function getExplainStyle(): ExplainStyle {
  return readSettings().explainStyle === "ste" ? "ste" : "plain";
}

export function setExplainStyle(v: ExplainStyle): void {
  const s = readSettings();
  s.explainStyle = v;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(s, null, 2));
}

/** The main writing rules of ASD-STE100, for a model writing for the person. */
export const STE_RULES = [
  "Write in Simplified Technical English (ASD-STE100). Follow these rules:",
  "- Use simple, common words, and use each word with only one meaning (for example, use \"use\", not \"utilize\"; \"start\", not \"initiate\"; \"show\", not \"display\" or \"render\"; \"make sure\", not \"ensure\").",
  "- Keep sentences short: no more than 20 words in an instruction, and no more than 25 words in a description.",
  "- Write only one idea or one instruction in each sentence. Keep paragraphs to six sentences or fewer, about one topic.",
  "- Use the active voice (\"Protégé changed the form\", not \"the form was changed\").",
  "- Use only the simple tenses: present, past and future. Do not use \"-ing\" verb forms, except in a technical name.",
  "- Do not leave out words to make a sentence shorter. Keep \"the\", \"a\" and \"that\".",
  "- Write instructions as commands (\"Click Keep\"). Put a condition first (\"If the list is empty, add a matter\").",
  "- Use a numbered list for steps that must be done in order.",
  "- Do not use phrasal verbs (\"set up\", \"carry out\"), idioms or contractions.",
  "- If you must use a technical name, say what it is in a simple sentence the first time you use it.",
].join("\n");

/**
 * The rules to add to a prompt, or nothing when the person chose everyday plain English. For a prompt
 * that asks for JSON, the format is said again last, so the rules change only the words inside it.
 */
export function explainRules(opts: { json?: boolean } = {}): string {
  if (getExplainStyle() !== "ste") return "";
  const tail = opts.json
    ? "\nApply these rules only to the words the person reads. Still reply with only the JSON asked for above, in exactly that shape."
    : "";
  return `\n\n${STE_RULES}${tail}\n`;
}
