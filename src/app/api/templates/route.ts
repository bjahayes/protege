import { NextResponse } from "next/server";
import { templateList } from "@/lib/templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ templates: templateList() });
}
