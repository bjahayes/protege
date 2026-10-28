import { NextRequest, NextResponse } from "next/server";
import { projectDir, unknownProject } from "@/lib/project-guard";
import fs from "fs";
import { query } from "@/lib/engine";
import {
  readSuggestions,
  writeSuggestions,
  buildSuggestionsContext,
  buildSuggestionsPrompt,
  type Suggestion,
} from "@/lib/suggestions";
import { isDemoId, demoSuggestions } from "@/lib/demo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FALLBACK: Suggestion[] = [
  { kind: "ask", text: "Explain what this project is and what it does, in simple terms" },
  { kind: "ask", text: "Where is this up to, and what's left to do?" },
  { kind: "do", text: "Tidy up the wording in the main document" },
  { kind: "do", text: "Write a short summary at the top of the project" },
];

async function generate(dir: string): Promise<Suggestion[]> {
  const context = buildSuggestionsContext(dir);
  let text = "";
  try {
    for await (const msg of query({
      prompt: buildSuggestionsPrompt(context),
      options: { model: "claude-haiku-4-5-20251001", tools: [], maxTurns: 1, settingSources: [], persistSession: false } as any,
    }) as any) {
      if (msg.type === "result" && typeof msg.result === "string") text = msg.result;
    }
  } catch {
    return FALLBACK;
  }
  try {
    const m = text.match(/\[[\s\S]*\]/);
    const arr = m ? JSON.parse(m[0]) : null;
    if (Array.isArray(arr) && arr.length) {
      return arr
        .filter((s) => s && typeof s.text === "string")
        .map((s): Suggestion => ({ kind: s.kind === "ask" ? "ask" : "do", text: String(s.text).slice(0, 140) }))
        .slice(0, 6);
    }
  } catch {
    /* ignore */
  }
  return FALLBACK;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (isDemoId(id)) return NextResponse.json({ suggestions: demoSuggestions(id), cached: true });
  const dir = await projectDir(id);
  if (!dir) return unknownProject();
  if (!fs.existsSync(dir)) return NextResponse.json({ suggestions: FALLBACK });

  const refresh = req.nextUrl.searchParams.get("refresh") === "1";
  if (!refresh) {
    const cached = readSuggestions(dir);
    if (cached && cached.length) return NextResponse.json({ suggestions: cached, cached: true });
  }
  const suggestions = await generate(dir);
  writeSuggestions(dir, suggestions);
  return NextResponse.json({ suggestions });
}
