import { NextRequest, NextResponse } from "next/server";
import { projectDir, unknownProject } from "@/lib/project-guard";
import fs from "fs";
import path from "path";
import type { PermissionMode } from "@anthropic-ai/claude-agent-sdk";
import { attachmentBlocks } from "@/lib/chat-attach";
import { getChatManager } from "@/lib/chat-manager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODES = new Set(["default", "acceptEdits", "plan", "auto", "bypassPermissions"]);

// Send a message. With a sessionId, continues that conversation (starting its process if
// needed); without one, starts a new conversation in the project's folder.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const text = String(body.text || "").trim();
  const projectId = String(body.projectId || "");
  const attachments = Array.isArray(body.attachments) ? body.attachments : [];
  if ((!text && !attachments.length) || !projectId)
    return NextResponse.json({ error: "projectId and a message or attachment are required" }, { status: 400 });
  const projectPath = await projectDir(projectId);
  if (!projectPath) return unknownProject();
  if (!fs.existsSync(projectPath)) return NextResponse.json({ error: `Folder not found: ${projectPath}` }, { status: 400 });

  const mode = MODES.has(body.permissionMode) ? (body.permissionMode as PermissionMode) : undefined;
  const model = body.model ? String(body.model) : undefined;
  const effort = body.effort ? String(body.effort) : undefined;
  const cm = getChatManager();
  let sessionId: string | undefined = body.sessionId || undefined;
  const live = sessionId ? cm.get(sessionId) : undefined;

  if (!live) {
    sessionId = await cm.open({ projectPath, projectName: path.basename(projectPath), resume: sessionId, model, permissionMode: mode, effort });
  } else {
    if (mode && mode !== live.permissionMode) await cm.setMode(sessionId!, mode);
    if (model !== live.model) await cm.setModel(sessionId!, model);
    if (effort !== live.effort) await cm.setEffort(sessionId!, effort);
  }
  let att: { blocks: any[]; lines: string[] };
  try {
    att = attachmentBlocks(attachments, sessionId!);
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 400 });
  }
  // The person's words first, so the conversation is titled by them, then the saved files.
  cm.send(sessionId!, [text, ...att.lines].filter(Boolean).join("\n"), att.blocks);
  return NextResponse.json({ sessionId });
}
