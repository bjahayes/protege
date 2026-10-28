import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { discoverProjects } from "@/lib/discovery";
import { registerProject } from "@/lib/store";
import { scaffoldProject } from "@/lib/docs";
import { demoSummaries } from "@/lib/demo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // Demo mode swaps in made-up projects so nobody sees real work while exploring.
  if (req.cookies.get("bw_demo")?.value === "1") {
    return NextResponse.json({ projects: demoSummaries(), demo: true });
  }
  const projects = await discoverProjects();
  return NextResponse.json({ projects });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const rawPath: string = (body.path || "").trim();
  const scaffold: boolean = !!body.scaffold;
  if (!rawPath) {
    return NextResponse.json({ error: "path is required" }, { status: 400 });
  }
  const abs = path.resolve(rawPath);
  if (!fs.existsSync(abs)) {
    return NextResponse.json({ error: `Path does not exist: ${abs}` }, { status: 400 });
  }
  if (!fs.statSync(abs).isDirectory()) {
    return NextResponse.json({ error: `Not a directory: ${abs}` }, { status: 400 });
  }
  const name = (body.name || path.basename(abs)).trim();
  registerProject(abs, name);
  let created: string[] = [];
  if (scaffold) {
    try {
      created = scaffoldProject(abs, name);
    } catch (e: any) {
      return NextResponse.json({ error: `Scaffold failed: ${e?.message}` }, { status: 500 });
    }
  }
  return NextResponse.json({ ok: true, path: abs, name, scaffolded: created });
}
