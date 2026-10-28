import { NextRequest } from "next/server";
import { getJobManager } from "@/lib/job-manager";
import type { JobEvent } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const jm = getJobManager();
  const job = jm.get(id);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const send = (event: string, data: any) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };

      if (!job) {
        send("error", { message: "Job not found" });
        controller.close();
        return;
      }

      // Replay buffered/persisted events first.
      const backlog = jm.getEvents(id);
      send("snapshot", { job, count: backlog.length });
      for (const e of backlog) send("event", e);

      // If terminal, close after replay.
      const terminal = ["done", "error", "stopped"].includes(job.status);
      if (terminal) {
        send("end", { status: job.status });
        controller.close();
        return;
      }

      const unsub = jm.subscribe(id, (e: JobEvent) => {
        send("event", e);
        if (e.type === "result" || e.type === "error" || (e.type === "status" && e.payload?.status === "stopped")) {
          const latest = jm.get(id);
          send("end", { status: latest?.status });
          cleanup();
        }
      });

      // Heartbeat to keep the connection alive through proxies.
      const hb = setInterval(() => send("ping", { t: Date.now() }), 15000);

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(hb);
        unsub();
        try {
          controller.close();
        } catch {
          /* ignore */
        }
      };

      // Close if the job is already gone from live (safety) — checked lazily via heartbeat.
      _req.signal?.addEventListener("abort", cleanup);
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
