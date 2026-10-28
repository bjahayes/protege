"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

interface Guide {
  title: string;
  body: string;
  screen: string; // plain label of the current screen, sent to the guide
  asks: string[]; // suggested questions for this screen
}

const COMMON_ASKS = ["How does this keep my work safe?", "Where do I start?"];

function guideFor(pathname: string): Guide {
  if (pathname.startsWith("/simple/new"))
    return {
      title: "Starting something new",
      screen: "the “Start something new” page, where you create a project from a template",
      body: "Pick a starting point, give it a name, and (optionally) describe what you want. You'll get something that already works, then we shape it together.",
      asks: ["What do these templates do?", "Do I have to describe it now?"],
    };
  if (pathname.startsWith("/simple/do"))
    return {
      title: "Getting something done",
      screen: "the “Do a task” page, where you describe a change for Protégé to make",
      body: "Two quick steps: pick the project, then tell me what you'd like — in plain words. I work on a safe copy and show you before keeping anything.",
      asks: ["How do I describe a task well?", "What happens after I click Start?"],
    };
  if (pathname.startsWith("/simple/preview"))
    return {
      title: "Seeing it working",
      screen: "the live preview of a project — the project running as a real web page",
      body: "This is your project running for real. Switch between a computer and phone view, and hit Refresh after a change to see the latest.",
      asks: ["Is this the real thing?", "How do I change what I see here?"],
    };
  if (pathname.startsWith("/simple/project"))
    return {
      title: "Your project, in plain English",
      screen: "a project's overview page (plain-English summary, actions, and history)",
      body: "A jargon-free overview of where things are up to. Use “Ask a question” to learn more, “Make a change” to get work done, or “See it working” to try it.",
      asks: ["What can I do from here?", "How do I undo a change?"],
    };
  if (pathname.startsWith("/simple/ask"))
    return {
      title: "Ask me anything",
      screen: "the “Ask a question” page, a chat that reads your work and answers",
      body: "Ask in plain English, like you'd ask a colleague — no special wording needed. I read your work to answer, and I won't change anything.",
      asks: ["What kinds of things can I ask?", "Will this change my files?"],
    };
  if (pathname.startsWith("/simple/help"))
    return {
      title: "How this works",
      screen: "the “How this works” help page",
      body: "A quick tour of what Protégé does. Ask me anything you're unsure about — I'm here to help you find your way around.",
      asks: COMMON_ASKS,
    };
  return {
    title: "Hi — I'm Protégé 👋",
    screen: "the home page (your list of projects)",
    body: "You can start something new, get me to do a task, ask me a question, or open a project to see where it's up to. Ask me anything about using this.",
    asks: ["Where do I start?", "What can this do?"],
  };
}

export default function GuideHelper() {
  const pathname = usePathname();
  const [open, setOpen] = useState(true);
  const [ready, setReady] = useState(false);
  const [demo, setDemo] = useState(false);

  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [asking, setAsking] = useState(false);
  const answerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setOpen(localStorage.getItem("bw_guide_collapsed") !== "1");
    setDemo(localStorage.getItem("bw_demo") === "1");
    setReady(true);
  }, []);

  // A route change clears any prior answer so the guide feels of-the-moment.
  useEffect(() => {
    setAnswer("");
    setQuestion("");
  }, [pathname]);

  const guide = guideFor(pathname);
  if (!ready) return null;

  const collapse = () => {
    localStorage.setItem("bw_guide_collapsed", "1");
    setOpen(false);
  };
  const expand = () => {
    localStorage.setItem("bw_guide_collapsed", "0");
    setOpen(true);
  };

  const ask = async (qRaw?: string) => {
    const q = (qRaw ?? question).trim();
    if (!q || asking) return;
    setQuestion(q);
    setAnswer("");
    setAsking(true);
    try {
      const res = await fetch("/api/guide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, screen: guide.screen, demo }),
      });
      const reader = res.body?.getReader();
      if (!reader) throw new Error("no stream");
      const dec = new TextDecoder();
      let buf = "";
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const chunks = buf.split("\n\n");
        buf = chunks.pop() || "";
        for (const c of chunks) {
          const ev = /event: (.*)/.exec(c)?.[1];
          const dataLine = /data: (.*)/.exec(c)?.[1];
          if (!ev || !dataLine) continue;
          const data = JSON.parse(dataLine);
          if (ev === "delta") {
            acc += data.text || "";
            setAnswer(acc);
            answerRef.current?.scrollTo({ top: answerRef.current.scrollHeight });
          } else if (ev === "done") {
            if (data.text && data.text.length > acc.length) setAnswer(data.text);
          } else if (ev === "error") {
            setAnswer("Sorry — I couldn't answer that just now. Please try again.");
          }
        }
      }
    } catch {
      setAnswer("Sorry — I couldn't answer that just now. Please try again.");
    } finally {
      setAsking(false);
    }
  };

  if (!open) return <ReopenPill onClick={expand} />;

  return (
    <div className="fixed bottom-4 right-4 z-40 w-80 max-w-[calc(100vw-2rem)]">
      <div className="rounded-2xl border border-accent/30 bg-panel shadow-2xl p-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 shrink-0 rounded-full bg-accent/15 border border-accent/30 flex items-center justify-center text-lg">
            ✦
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">{guide.title}</div>
            {!answer && <p className="text-[13px] text-muted mt-1 leading-relaxed">{guide.body}</p>}
          </div>
          <button onClick={collapse} className="text-muted hover:text-text text-sm -mt-1 -mr-1" title="Hide">
            ✕
          </button>
        </div>

        {/* Streamed answer */}
        {(answer || asking) && (
          <div
            ref={answerRef}
            className="mt-3 max-h-52 overflow-y-auto rounded-xl bg-bg border border-border p-3 text-[13px] leading-relaxed"
          >
            {question && <div className="text-[11px] text-muted mb-1">You asked: {question}</div>}
            <div className="whitespace-pre-wrap">{answer || <span className="text-muted">Thinking…</span>}</div>
          </div>
        )}

        {/* Suggested questions */}
        {!answer && !asking && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {guide.asks.map((a) => (
              <button
                key={a}
                onClick={() => ask(a)}
                className="text-[11px] px-2 py-1 rounded-lg border border-border text-muted hover:text-text hover:border-accent/40"
              >
                {a}
              </button>
            ))}
          </div>
        )}

        {/* Ask box */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask();
          }}
          className="mt-3 flex items-center gap-2"
        >
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask about using this…"
            className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-bg border border-border text-[13px] focus:outline-none focus:border-accent/60"
          />
          <button
            type="submit"
            disabled={asking || !question.trim()}
            className="shrink-0 px-3 py-2 rounded-xl bg-accent/20 border border-accent/40 text-accent hover:bg-accent/30 text-sm disabled:opacity-40"
            title="Ask"
          >
            {asking ? "…" : "Ask"}
          </button>
        </form>

        {answer && !asking && (
          <button onClick={() => { setAnswer(""); setQuestion(""); }} className="mt-2 text-[11px] text-muted hover:text-text">
            ← Back to tips
          </button>
        )}
      </div>
    </div>
  );
}

function ReopenPill({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="fixed bottom-4 right-4 z-40 rounded-full border border-accent/30 bg-panel shadow-xl px-3 py-2 text-sm text-accent hover:bg-accent/10 flex items-center gap-1.5"
    >
      <span>✦</span> Protégé
    </button>
  );
}
