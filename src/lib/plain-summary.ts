import path from "path";
import { readFileSafe } from "./docs";
import { metaPath, metaRel } from "./meta";

export function plainSummaryPath(dir: string): string {
  return metaPath(dir, "plain-summary.md");
}

export function readPlainSummary(dir: string): string | null {
  return readFileSafe(plainSummaryPath(dir));
}

// The opening sentence(s) of the plain summary, for cards. Cheap; only reads if present.
export function plainSummaryExcerpt(dir: string): string | null {
  const raw = readPlainSummary(dir);
  if (!raw) return null;
  const firstPara = raw
    .split("\n")
    .filter((l) => l.trim() && !l.trim().startsWith("#") && !l.trim().startsWith("-"))
    .join(" ")
    .replace(/[*_`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!firstPara) return null;
  return firstPara.length > 160 ? firstPara.slice(0, 160) + "…" : firstPara;
}

export function buildPlainSummaryPrompt(dir?: string): string {
  const summary = metaRel(dir, "plain-summary.md");
  const assessment = metaRel(dir, "assessment.json");
  return (
    `Write a plain-English summary of THIS project for a NON-TECHNICAL reader — imagine a lawyer with no coding or software background who needs to understand what this is.\n\n` +
    `First, understand the project: read the README, any docs, the main files, and ${assessment} if it exists.\n\n` +
    `Then write a warm, jargon-free summary to the file ${summary} with exactly these markdown sections:\n\n` +
    `A short opening paragraph (no heading): what this project IS and what it's for, in everyday terms. Use a simple analogy if it helps. Imagine explaining it to a smart friend who doesn't work in tech.\n\n` +
    `## What it can do\n- 3 to 5 bullet points, each a plain-language capability.\n\n` +
    `## Where it's up to\nOne or two sentences on how finished it is and what's happening now.\n\n` +
    `## Good to know\n- 2 to 3 plain bullets a non-technical person should understand (limitations, what's safe, what to watch).\n\n` +
    `STRICT RULES:\n` +
    `- Absolutely NO technical jargon. Do not use words like: API, framework, library, database, repository, SDK, function, class, deployment, backend, frontend, commit, endpoint, schema, runtime, or any programming/tool names.\n` +
    `- If a technical thing matters, describe what it DOES for the person in everyday language instead of naming it.\n` +
    `- Keep it concise (under ~250 words), warm, and confident. No hedging, no "as an AI".\n\n` +
    `Write ONLY the file ${summary}. When done, reply with a one-line confirmation.`
  );
}
