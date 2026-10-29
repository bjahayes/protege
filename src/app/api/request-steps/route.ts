import { NextRequest, NextResponse } from "next/server";
import { requestProgress } from "@/lib/request-steps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The to-do list Protégé makes from a request when Claude doesn't keep one (lib/request-steps.ts).
// POST { request, changes: string[], said: string[], finished } → { steps: [{ text, status }] }
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const request = String(b.request || "").trim().slice(0, 2000);
  if (!request) return NextResponse.json({ steps: [] });
  const list = (x: unknown, n: number) => (Array.isArray(x) ? x : []).slice(-n).map((s) => String(s || "").slice(0, 1600)).filter(Boolean);
  const steps = await requestProgress(request, { changes: list(b.changes, 40), said: list(b.said, 8) }, !!b.finished);
  return NextResponse.json({ steps });
}
