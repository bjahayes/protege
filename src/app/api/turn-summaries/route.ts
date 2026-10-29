import { NextRequest, NextResponse } from "next/server";
import { summarizeTurns } from "@/lib/turn-summaries";
import type { TurnDigest } from "@/lib/turn-digest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX = 200;

// Short summaries of what turns did (lib/turn-summaries.ts), writing any not written yet.
// POST { turns: [{ key, request, report, files }] } → { summaries: { key: summary } }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const turns: TurnDigest[] = (Array.isArray(body.turns) ? body.turns : []).slice(0, MAX).map((t: any) => ({
    key: String(t?.key || "").slice(0, 40),
    request: String(t?.request || "").slice(0, 2000),
    report: String(t?.report || "").slice(0, 3000),
    files: (Array.isArray(t?.files) ? t.files : []).slice(0, 200).map((f: any) => ({ path: String(f?.path || "").slice(0, 300), added: 0, removed: 0, created: false })),
    steps: 0,
    startedAt: 0,
    endedAt: 0,
  }));
  return NextResponse.json({ summaries: await summarizeTurns(turns.filter((t) => t.key)) });
}
