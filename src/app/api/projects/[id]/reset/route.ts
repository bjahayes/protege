import { NextRequest, NextResponse } from "next/server";
import { isDemoId, resetDemo } from "@/lib/demo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Reset a demo project back to its original starting point.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isDemoId(id)) {
    return NextResponse.json({ error: "Only demo projects can be reset." }, { status: 400 });
  }
  try {
    resetDemo(id);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Couldn't reset." }, { status: 500 });
  }
}
