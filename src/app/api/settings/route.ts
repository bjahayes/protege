import { NextRequest, NextResponse } from "next/server";
import { getExplainStyle, setExplainStyle } from "@/lib/explain-style";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Protégé-wide settings the person chooses: for now, how explanations are written.
export async function GET() {
  return NextResponse.json({ explainStyle: getExplainStyle() });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  if (body.explainStyle === "ste" || body.explainStyle === "plain") setExplainStyle(body.explainStyle);
  return NextResponse.json({ explainStyle: getExplainStyle() });
}
