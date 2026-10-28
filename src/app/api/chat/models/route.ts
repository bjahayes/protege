import { NextResponse } from "next/server";
import { chatModels } from "@/lib/chat-manager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The models (and effort levels) this computer's Claude Code offers, as in Claude desktop's picker.
export async function GET() {
  try {
    return NextResponse.json({ models: await chatModels() });
  } catch (e: any) {
    return NextResponse.json({ models: [], error: String(e?.message || e) });
  }
}
