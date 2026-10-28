import { NextResponse } from "next/server";
import { brainAvailable } from "@/lib/brain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Whether there's a second brain to read, so pages can leave out what needs one.
export async function GET() {
  return NextResponse.json({ available: brainAvailable() });
}
