import { NextRequest } from "next/server";
import { query } from "@/lib/engine";
import { buildGuideSystemPrompt } from "@/lib/guide";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The in-app guide. A cheap, tool-less, single-shot Q&A about how to use the app.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const question: string = (body.question || "").toString().slice(0, 500);
  const screen: string = (body.screen || "the app").toString().slice(0, 120);
  const demo = !!body.demo;
  if (!question.trim()) return new Response("Ask a question", { status: 400 });

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
          prompt: question,
          options: {
            model: "claude-haiku-4-5-20251001",
            tools: [],
            maxTurns: 1,
            includePartialMessages: true,
            settingSources: [],
            persistSession: false,
            systemPrompt: buildGuideSystemPrompt(screen, demo),
          } as any,
        });
        for await (const msg of q as any) {
          if (msg.type === "stream_event") {
            const e = msg.event;
            if (e?.type === "content_block_delta" && e.delta?.type === "text_delta") send("delta", { text: e.delta.text });
          } else if (msg.type === "result") {
            send("done", { text: typeof msg.result === "string" ? msg.result : "" });
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
