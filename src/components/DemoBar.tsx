"use client";

import { useEffect, useState } from "react";
import { isDemoOn, setDemo } from "@/lib/demo-client";

/** In the full view: says when demo projects are showing instead of yours (the switch is in Settings). */
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
