import { NextRequest, NextResponse } from "next/server";
import { projectDir, unknownProject } from "@/lib/project-guard";
import { listVersions, readVersion, restoreVersion } from "@/lib/doc-versions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A project document's saved versions.
//   GET ?file=PLAN.md          the list
//   GET ?file=PLAN.md&n=3      version 3's text
//   POST { file, n }           put version n back (saved as a new version)
const safe = (f: string) => !!f && !f.includes("..") && !/^[A-Za-z]:|^[\/]/.test(f);

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dir = await projectDir(id);
  if (!dir) return unknownProject();
  const file = req.nextUrl.searchParams.get("file") || "";
  if (!safe(file)) return NextResponse.json({ error: "Bad file" }, { status: 400 });
  const n = Number(req.nextUrl.searchParams.get("n"));
  if (n) return NextResponse.json({ text: readVersion(dir, file, n) });
  return NextResponse.json({ versions: listVersions(dir, file) });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dir = await projectDir(id);
  if (!dir) return unknownProject();
  const b = await req.json().catch(() => ({}));
  if (!safe(String(b.file || "")) || !Number(b.n)) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const v = restoreVersion(dir, String(b.file), Number(b.n));
  return NextResponse.json({ ok: !!v, version: v });
}
