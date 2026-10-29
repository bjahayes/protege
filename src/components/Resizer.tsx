"use client";

// Side panels that the person can resize, the way every desktop app works: drag the edge, double-click
// it to put the width back, or focus it and use the arrow keys. Each panel's width is remembered.

import { useCallback, useEffect, useRef, useState } from "react";

function read(key: string, fallback: number): number {
  try {
    const v = Number(localStorage.getItem(key));
    return Number.isFinite(v) && v > 0 ? v : fallback;
  } catch {
    return fallback;
  }
}

/**
 * A remembered width in pixels. `max` may be a function of the window width, so a panel can't be
 * dragged so wide that the rest of the page has no room.
 */
export function usePanelWidth(key: string, initial: number, min: number, max: number | ((vw: number) => number)) {
  // Callers pass `max` as a new function on every render. Kept in a ref so `limit` stays the same
  // function: otherwise the effect below re-reads the saved width on every redraw, and a panel being
  // dragged snaps back to its old width at each mouse move.
  const maxRef = useRef(max);
  maxRef.current = max;
  const limit = useCallback(
    (w: number) => {
      const vw = typeof window === "undefined" ? 1600 : window.innerWidth;
      const m = maxRef.current;
      const hi = Math.max(min, typeof m === "function" ? m(vw) : m);
      return Math.round(Math.min(hi, Math.max(min, w)));
    },
    [min]
  );
  const [width, setWidth] = useState(initial);
  useEffect(() => setWidth(limit(read(key, initial))), [key, initial, limit]);
  useEffect(() => {
    const onResize = () => setWidth((w) => limit(w));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [limit]);
  const set = useCallback(
    (w: number, save = true) => {
      const v = limit(w);
      setWidth(v);
      if (save)
        try {
          localStorage.setItem(key, String(v));
        } catch {
          /* not remembered */
        }
    },
    [key, limit]
  );
  const reset = useCallback(() => {
    try {
      localStorage.removeItem(key);
    } catch {}
    setWidth(limit(initial));
  }, [key, initial, limit]);
  return { width, set, reset };
}

/**
 * The draggable edge between two panes. `side` is where the resized panel sits relative to the
 * handle: "left" means dragging right makes it wider; "right" means dragging left makes it wider.
 */
export function ResizeHandle({
  width,
  onChange,
  onReset,
  side,
  label,
  min,
}: {
  width: number;
  onChange: (w: number, save?: boolean) => void;
  onReset: () => void;
  side: "left" | "right";
  label: string;
  min?: number;
}) {
  const start = useRef<{ x: number; w: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const dir = side === "left" ? 1 : -1;

  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => {
      if (!start.current) return;
      onChange(start.current.w + dir * (e.clientX - start.current.x), false);
    };
    const up = (e: PointerEvent) => {
      if (start.current) onChange(start.current.w + dir * (e.clientX - start.current.x), true);
      start.current = null;
      setDragging(false);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    // While dragging, the whole page shows the resize cursor and text doesn't get selected.
    const body = document.body.style;
    const prev = [body.cursor, body.userSelect];
    body.cursor = "col-resize";
    body.userSelect = "none";
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      body.cursor = prev[0];
      body.userSelect = prev[1];
    };
  }, [dragging, dir, onChange]);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={`${label}: drag to resize, double-click to reset`}
      aria-valuenow={width}
      aria-valuemin={min}
      tabIndex={0}
      title="Drag to resize · double-click to reset"
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        start.current = { x: e.clientX, w: width };
        setDragging(true);
      }}
      onDoubleClick={onReset}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 64 : 16;
        if (e.key === "ArrowLeft") onChange(width - dir * step);
        else if (e.key === "ArrowRight") onChange(width + dir * step);
        else if (e.key === "Home" || e.key === "Enter") onReset();
        else return;
        e.preventDefault();
      }}
      // A 9 px grip that takes no room (it overlaps the panes by 4 px each side), with a thin line
      // that shows on hover, focus and drag.
      className="group relative w-[9px] -mx-[4px] shrink-0 self-stretch cursor-col-resize z-10 outline-none max-md:hidden"
    >
      <span
        className={`absolute inset-y-0 left-[3.5px] w-[2px] transition-colors ${
          dragging ? "bg-accent" : "bg-transparent group-hover:bg-accent/60 group-focus-visible:bg-accent"
        }`}
      />
    </div>
  );
}
