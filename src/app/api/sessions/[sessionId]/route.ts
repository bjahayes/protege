import { NextRequest, NextResponse } from "next/server";
import { sessionTranscript } from "@/lib/discovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BLOCK_CAP = 8000;

interface Block {
  kind: "text" | "thinking" | "tool_use" | "tool_result" | "image";
  text: string;
  name?: string;
  truncated?: boolean;
  src?: string; // data/URL for image blocks
}

function cap(s: string): { text: string; truncated: boolean } {
  const str = String(s ?? "");
  if (str.length > BLOCK_CAP) return { text: str.slice(0, BLOCK_CAP), truncated: true };
  return { text: str, truncated: false };
}

function imageSrc(part: any): string | null {
  const src = part?.source;
  if (!src) return null;
  if (src.type === "base64" && src.data) return `data:${src.media_type || "image/png"};base64,${src.data}`;
  if (src.type === "url" && src.url) return src.url;
  return null;
}

// A tool_result's content can be a string, or an array of text/image parts
// (e.g. a browser screenshot). Render images as image blocks — never dump base64.
function pushToolResult(content: any, out: Block[]) {
  if (typeof content === "string") {
    const { text, truncated } = cap(content);
    out.push({ kind: "tool_result", text, truncated });
    return;
  }
  if (Array.isArray(content)) {
    for (const part of content) {
      if (typeof part === "string") {
        const { text, truncated } = cap(part);
        if (text.trim()) out.push({ kind: "tool_result", text, truncated });
      } else if (part?.type === "text") {
        const { text, truncated } = cap(part.text);
        if (text.trim()) out.push({ kind: "tool_result", text, truncated });
      } else if (part?.type === "image") {
        const s = imageSrc(part);
        if (s) out.push({ kind: "image", text: "image", src: s });
        else out.push({ kind: "tool_result", text: "[image]" });
      } else {
        const { text, truncated } = cap(JSON.stringify(part));
        out.push({ kind: "tool_result", text, truncated });
      }
    }
    return;
  }
  const { text, truncated } = cap(JSON.stringify(content, null, 2));
  out.push({ kind: "tool_result", text, truncated });
}

function toBlocks(content: any): Block[] {
  if (content == null) return [];
  if (typeof content === "string") {
    const { text, truncated } = cap(content);
    return text.trim() ? [{ kind: "text", text, truncated }] : [];
  }
  if (!Array.isArray(content)) return [];
  const blocks: Block[] = [];
  for (const b of content) {
    if (typeof b === "string") {
      const { text, truncated } = cap(b);
      if (text.trim()) blocks.push({ kind: "text", text, truncated });
    } else if (b?.type === "text") {
      const { text, truncated } = cap(b.text);
      if (text.trim()) blocks.push({ kind: "text", text, truncated });
    } else if (b?.type === "thinking") {
      const { text, truncated } = cap(b.thinking);
      if (text.trim()) blocks.push({ kind: "thinking", text, truncated });
    } else if (b?.type === "image") {
      const s = imageSrc(b);
      if (s) blocks.push({ kind: "image", text: "image", src: s });
    } else if (b?.type === "tool_use") {
      const { text, truncated } = cap(typeof b.input === "string" ? b.input : JSON.stringify(b.input, null, 2));
      blocks.push({ kind: "tool_use", name: b.name, text, truncated });
    } else if (b?.type === "tool_result") {
      pushToolResult(b.content, blocks);
    }
  }
  return blocks;
}

const ERROR_RE =
  /(\berror\b|\bfailed\b|\bexception\b|traceback|permission denied|\bdenied\b|not found|no such file|ENOENT|EACCES|ECONN|exit code [1-9]|command failed|cannot |couldn't |unable to)/i;
const DECISION_RE =
  /(should i\b|shall i\b|do you want|would you like|which (one|option|approach)|let me know|your call|up to you|do you prefer|which of|confirm |go ahead\?|want me to|should we\b)/i;

type Category = "instruction" | "decision" | "error" | "result" | "action" | "analysis" | "thinking";

function classify(role: string, blocks: Block[]): Category {
  const kinds = new Set(blocks.map((b) => b.kind));
  const textBlocks = blocks.filter((b) => b.kind === "text");
  const allText = textBlocks.map((b) => b.text).join("\n");
  const hasError = blocks.some((b) => (b.kind === "tool_result" || b.kind === "text") && ERROR_RE.test(b.text));

  if (role === "user") {
    // Real human input has text blocks; tool-result-only "user" turns are results.
    if (kinds.has("text")) return "instruction";
    if (hasError) return "error";
    return "result";
  }
  // assistant
  if (kinds.has("tool_result") && hasError) return "error";
  if (kinds.has("tool_use")) return "action";
  // No user-facing text and no tools → silent reasoning.
  if (!textBlocks.length && kinds.has("thinking")) return "thinking";
  if (textBlocks.length && DECISION_RE.test(allText)) return "decision";
  // Any user-facing assistant text is analysis the AI is giving you.
  return "analysis";
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const sp = req.nextUrl.searchParams;
  const cwd = sp.get("cwd") || undefined;
  const limit = Math.min(400, Math.max(10, parseInt(sp.get("limit") || "80", 10)));
  const before = sp.get("before") ? parseInt(sp.get("before")!, 10) : undefined; // index; return messages before this

  const raw = (await sessionTranscript(sessionId, cwd)) as any[];
  const mapped = raw.map((m: any, idx: number) => {
    const role = m.type || m.role || "?";
    const blocks = toBlocks(m.message?.content ?? m.content);
    return {
      idx,
      role,
      ts: m.timestamp ? new Date(m.timestamp).getTime() : undefined,
      blocks,
      category: classify(role, blocks),
    };
  });

  const total = mapped.length;
  const end = before !== undefined ? Math.min(before, total) : total;
  const start = Math.max(0, end - limit);
  const window = mapped.slice(start, end);

  return NextResponse.json({
    sessionId,
    total,
    start,
    end,
    hasOlder: start > 0,
    messages: window,
  });
}
