"use client";

import { useEffect, useRef, useState } from "react";
import MarkdownView from "./MarkdownView";

interface ToolAct {
  name: string;
  input: string;
}
interface Msg {
  role: "user" | "assistant";
  text: string;
  tools?: ToolAct[];
  streaming?: boolean;
  error?: boolean;
}

export interface ChatProps {
  endpoint: string;
  intro: string;
  starters: string[];
  placeholder?: string;
  initialInput?: string;
  /** Transform assistant text before markdown render (e.g. linkify [[slug]] citations). */
  linkify?: (text: string) => string;
}

export default function Chat({ endpoint, intro, starters, placeholder, initialInput, linkify }: ChatProps) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState(initialInput || "");
  const [busy, setBusy] = useState(false);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const scrollRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  useEffect(() => {
    if (stick.current && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    setInput("");
    setBusy(true);
    stick.current = true;
    setMessages((m) => [...m, { role: "user", text: q }, { role: "assistant", text: "", tools: [], streaming: true }]);

    const patchLast = (fn: (m: Msg) => Msg) =>
      setMessages((prev) => {
        const copy = prev.slice();
        copy[copy.length - 1] = fn(copy[copy.length - 1]);
        return copy;
      });

    try {
      const resp = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: q, sessionId }),
      });
      if (!resp.body) throw new Error("No stream");
      const reader = resp.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const frame = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          let ev = "message";
          let data = "";
          for (const line of frame.split("\n")) {
            if (line.startsWith("event:")) ev = line.slice(6).trim();
            else if (line.startsWith("data:")) data += line.slice(5).trim();
          }
          const d = data ? JSON.parse(data) : {};
          if (ev === "session") setSessionId(d.sessionId);
          else if (ev === "delta") patchLast((m) => ({ ...m, text: m.text + d.text }));
          else if (ev === "tool") patchLast((m) => ({ ...m, tools: [...(m.tools || []), { name: d.name, input: d.input }] }));
          else if (ev === "done") patchLast((m) => ({ ...m, text: d.text || m.text, streaming: false }));
          else if (ev === "error") patchLast((m) => ({ ...m, text: m.text || d.message, streaming: false, error: true }));
        }
      }
    } catch (e: any) {
      patchLast((m) => ({ ...m, text: m.text || String(e?.message || e), streaming: false, error: true }));
    } finally {
      patchLast((m) => ({ ...m, streaming: false }));
      setBusy(false);
    }
  };

  const reset = () => {
    setMessages([]);
    setSessionId(undefined);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] text-muted">{intro}</p>
        {messages.length > 0 && (
          <button onClick={reset} className="text-xs text-muted hover:text-text shrink-0">
            ↺ New chat
          </button>
        )}
      </div>

      <div ref={scrollRef} onScroll={onScroll} className="flex-1 min-h-0 overflow-y-auto space-y-4 pr-1">
        {messages.length === 0 && (
          <div className="pt-8">
            <div className="text-center text-muted text-sm mb-4">Ask anything.</div>
            <div className="flex flex-col gap-2 max-w-md mx-auto">
              {starters.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="text-left text-sm px-3 py-2 rounded-lg border border-border bg-panel hover:border-accent/40 text-muted hover:text-text"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <Bubble key={i} m={m} linkify={linkify} />
        ))}
      </div>

      <div className="mt-3 flex items-end gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          rows={1}
          placeholder={placeholder || "Ask…  (Enter to send, Shift+Enter for newline)"}
          className="flex-1 px-3 py-2.5 rounded-lg bg-panel border border-border text-sm resize-none focus:outline-none focus:border-accent/60 max-h-32"
        />
        <button
          onClick={() => send(input)}
          disabled={busy || !input.trim()}
          className="px-4 py-2.5 rounded-lg bg-accent/20 border border-accent/40 text-accent hover:bg-accent/30 text-sm font-semibold disabled:opacity-40 shrink-0"
        >
          {busy ? "…" : "Ask"}
        </button>
      </div>
    </div>
  );
}

function Bubble({ m, linkify }: { m: Msg; linkify?: (t: string) => string }) {
  if (m.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-accent/15 border border-accent/25 px-3.5 py-2 text-sm whitespace-pre-wrap">
          {m.text}
        </div>
      </div>
    );
  }
  return (
    <div className="flex justify-start">
      <div className="max-w-[92%] w-full">
        {m.tools && m.tools.length > 0 && (
          <div className="mb-1.5 space-y-0.5">
            {m.tools.map((t, i) => (
              <div key={i} className="text-[11px] text-muted font-mono flex items-center gap-1.5">
                <span className="text-warn">🔧</span>
                {t.name === "Read" ? "reading" : t.name === "Grep" ? "searching" : t.name === "Glob" ? "listing" : t.name}{" "}
                <span className="text-muted/70 truncate">{t.input}</span>
              </div>
            ))}
          </div>
        )}
        <div
          className={`rounded-2xl rounded-bl-sm border px-3.5 py-2.5 ${
            m.error ? "border-bad/30 bg-bad/5 text-bad" : "border-border bg-panel"
          }`}
        >
          {m.streaming && !m.text ? (
            <span className="text-muted text-sm">
              thinking<span className="live-dot">…</span>
            </span>
          ) : m.streaming ? (
            <div className="text-sm whitespace-pre-wrap leading-relaxed">{m.text}</div>
          ) : (
            <div className="text-sm">
              <MarkdownView content={linkify ? linkify(m.text) : m.text} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
