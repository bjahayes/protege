import { NextRequest, NextResponse } from "next/server";
import { plainTodos } from "@/lib/todo-plain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Claude's to-do items in plain words (lib/todo-plain.ts).
// POST { items: string[], request? } → { plain: { item: plain wording } }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const items = (Array.isArray(body.items) ? body.items : []).slice(0, 60).map((t: unknown) => String(t || "").slice(0, 300)).filter(Boolean);
  return NextResponse.json({ plain: await plainTodos(items, String(body.request || "").slice(0, 1000)) });
}
