import { NextRequest, NextResponse } from "next/server";
import { planUsage } from "@/lib/plan-usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Claude plan usage limits and what is contributing to them, as Claude Code's /usage shows them.
// ?fresh=1 asks again instead of using the figures from the last minute.
export async function GET(req: NextRequest) {
  return NextResponse.json(await planUsage(req.nextUrl.searchParams.get("fresh") === "1"));
}
