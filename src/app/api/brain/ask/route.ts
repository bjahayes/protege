import { NextRequest } from "next/server";
import { query } from "@/lib/engine";
import { brainDir, brainAvailable } from "@/lib/brain";
import { buildBrainAskContext, buildBrainAskSystemPrompt } from "@/lib/ask";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function summarizeInput(v: any): string {
  if (v == null) return "";
  if (typeof v === "string") return v.slice(0, 80);
  const f = v.pattern || v.query || v.file_path || v.path || v.command || "";
  return String(f).slice(0, 80);
}

export async function POST(req: NextRequest) {
  if (!brainAvailable()) return new Response("Brain not available", { status: 400 });
  const body = await req.json().catch(() => ({}));
  const message: string = (body.message || "").toString();
  const sessionId: string | undefined = body.sessionId || undefined;
  const first = !sessionId;
  const prompt = first ? `${buildBrainAskContext()}\n\n---\n\nQuestion: ${message}` : message;

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
            cwd: brainDir(),
            tools: ["Read", "Grep", "Glob"],
            permissionMode: "acceptEdits",
            includePartialMessages: true,
            settingSources: [],
            resume: sessionId,
            systemPrompt: first ? buildBrainAskSystemPrompt() : undefined,
          } as any,
        });
        for await (const msg of q as any) {
          if (msg.type === "system" && msg.subtype === "init") send("session", { sessionId: msg.session_id });
          else if (msg.type === "stream_event") {
            const e = msg.event;
            if (e?.type === "content_block_delta" && e.delta?.type === "text_delta") send("delta", { text: e.delta.text });
          } else if (msg.type === "assistant") {
            for (const b of msg.message?.content ?? []) if (b.type === "tool_use") send("tool", { name: b.name, input: summarizeInput(b.input) });
          } else if (msg.type === "result") {
            send("done", { text: typeof msg.result === "string" ? msg.result : "", cost: msg.total_cost_usd, subtype: msg.subtype });
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
    headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" },
  });
}
