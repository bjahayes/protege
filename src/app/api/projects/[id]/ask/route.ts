import { NextRequest } from "next/server";
import fs from "fs";
import { query } from "@/lib/engine";
import { pathFromProjectId } from "@/lib/config";
import { buildAskContext, buildAskSystemPrompt } from "@/lib/ask";
import { isDemoId, materializeDemo } from "@/lib/demo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function summarizeInput(v: any): string {
  if (v == null) return "";
  if (typeof v === "string") return v.slice(0, 80);
  const f = v.file_path || v.path || v.pattern || v.query || v.command || "";
  return String(f).slice(0, 80);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const message: string = (body.message || "").toString();
  const sessionId: string | undefined = body.sessionId || undefined;

  // Demo projects are real folders on disk, so the assistant genuinely reads them.
  const dir = isDemoId(id) ? materializeDemo(id) : pathFromProjectId(id);
  if (!fs.existsSync(dir)) {
    return new Response("Project folder missing", { status: 400 });
  }

  const first = !sessionId;
  const prompt = first ? `${buildAskContext(dir)}\n\n---\n\nQuestion: ${message}` : message;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (event: string, data: any) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };
      try {
        const q = query({
          prompt,
          options: {
            cwd: dir,
            tools: ["Read", "Grep", "Glob"],
            permissionMode: "acceptEdits", // read-only toolset means nothing can mutate
            includePartialMessages: true,
            settingSources: ["user", "project", "local"],
            resume: sessionId,
            systemPrompt: first ? buildAskSystemPrompt() : undefined,
          } as any,
        });
        for await (const msg of q as any) {
          if (msg.type === "system" && msg.subtype === "init") {
            send("session", { sessionId: msg.session_id });
          } else if (msg.type === "stream_event") {
            const e = msg.event;
            if (e?.type === "content_block_delta" && e.delta?.type === "text_delta") {
              send("delta", { text: e.delta.text });
            }
          } else if (msg.type === "assistant") {
            for (const b of msg.message?.content ?? []) {
              if (b.type === "tool_use") send("tool", { name: b.name, input: summarizeInput(b.input) });
            }
          } else if (msg.type === "result") {
            send("done", {
              text: typeof msg.result === "string" ? msg.result : "",
              cost: msg.total_cost_usd,
              subtype: msg.subtype,
            });
          }
        }
      } catch (err: any) {
        send("error", { message: String(err?.message ?? err) });
      }
      closed = true;
      try {
        controller.close();
      } catch {
        /* ignore */
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
