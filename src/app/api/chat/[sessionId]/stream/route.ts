import { NextRequest } from "next/server";
import { getChatManager, type ChatEvent } from "@/lib/chat-manager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Live events for a running conversation: a snapshot (state and the text being written),
// the events since its process started, then new ones as they happen.
export async function GET(req: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const cm = getChatManager();
  const enc = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const send = (event: string, data: any) => {
        if (closed) return;
        try {
          controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };
      const live = cm.get(sessionId);
      if (!live) {
        send("snapshot", { state: null, partial: "" });
        send("end", {});
        controller.close();
        return;
      }
      const { events, partial } = cm.events(sessionId);
      send("snapshot", { state: cm.state(live), partial });
      for (const e of events) send("event", e);

      let hb: ReturnType<typeof setInterval> | undefined;
      let unsub = () => {};
      const cleanup = () => {
        if (closed) return;
        closed = true;
        if (hb) clearInterval(hb);
        unsub();
        try {
          controller.close();
        } catch {
          /* ignore */
        }
      };
      unsub = cm.subscribe(sessionId, (e: ChatEvent) => {
        send("event", e);
        if (e.type === "state" && e.state.status === "ended") {
          send("end", {});
          cleanup();
        }
      });
      hb = setInterval(() => send("ping", {}), 15000);
      req.signal?.addEventListener("abort", cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
