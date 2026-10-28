import { NextResponse } from "next/server";
import { listBrain } from "@/lib/brain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(listBrain());
}
