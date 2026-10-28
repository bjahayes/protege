"use client";

import { useEffect, useMemo, useState } from "react";
import Chat from "./Chat";

const STARTERS = [
  "What techniques show up across the most projects?",
  "What have I learned about evaluating LLM outputs?",
  "Summarize my approach to agent architectures.",
  "Which decisions recur, and where did they come from?",
];

// Turns [[slug]] citations into links that open the Brain explorer at that item.
export default function BrainChat() {
  const [titles, setTitles] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch("/api/brain", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        const map: Record<string, string> = {};
        for (const n of j.notes || []) map[n.slug] = n.title || n.slug;
        for (const p of j.projects || []) map[p.slug] = p.title || p.slug;
        setTitles(map);
      })
      .catch(() => {});
  }, []);

  const linkify = useMemo(
    () => (text: string) =>
      text.replace(/\[\[([a-z0-9][a-z0-9-]*)\]\]/gi, (m, slug) => {
        const title = titles[slug];
        return title ? `[${title}](/brain?item=${slug})` : m;
      }),
    [titles]
  );

  return (
    <div className="h-[calc(100vh-96px)] max-w-3xl mx-auto px-5 py-4">
      <Chat
        endpoint="/api/brain/ask"
        intro="Answers across all your projects and notes — it reads your second brain and cites the specific notes it used."
        starters={STARTERS}
        placeholder="Ask across everything you've built…  (Enter to send)"
        linkify={linkify}
      />
    </div>
  );
}
