"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isDemoOn, setDemo } from "@/lib/demo-client";

export function DemoToggle() {
  const router = useRouter();
  const [on, setOn] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setOn(isDemoOn());
    setReady(true);
  }, []);
  if (!ready) return null;

  const toggle = () => {
    const next = !on;
    setDemo(next);
    setOn(next);
    router.push("/simple");
    router.refresh();
    setTimeout(() => window.location.reload(), 50);
  };

  return (
    <button
      onClick={toggle}
      className={`w-full text-left px-3 py-2 rounded-lg border text-[13px] flex items-center gap-2 transition-colors ${
        on
          ? "border-accent/50 bg-accent/10 text-accent"
          : "border-border text-muted hover:text-text hover:border-accent/40"
      }`}
      title={on ? "Show your real projects again" : "Explore with made-up example projects"}
    >
      <span>🎭</span>
      <span className="flex-1">Demo mode</span>
      <span className={`text-[11px] font-semibold ${on ? "text-accent" : "text-muted"}`}>{on ? "ON" : "OFF"}</span>
    </button>
  );
}

/** In the full view, which has no demo switch: says when demo projects are showing instead of yours. */
export function DemoNotice() {
  const [on, setOn] = useState(false);
  useEffect(() => setOn(isDemoOn()), []);
  if (!on) return null;
  return (
    <div className="px-4 py-2 border-b border-accent/30 bg-accent/10 text-[12.5px] text-accent flex items-center gap-3">
      <span>🎭</span>
      <span className="flex-1">Demo mode is on, so Protégé is showing made-up example projects instead of yours.</span>
      <button
        onClick={() => {
          setDemo(false);
          window.location.reload();
        }}
        className="px-2.5 py-1 rounded-md border border-accent/40 hover:bg-accent/20 font-semibold shrink-0"
      >
        Show my projects
      </button>
    </div>
  );
}
