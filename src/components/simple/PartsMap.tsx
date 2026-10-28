"use client";

// "How it fits together": the project's parts (from .protege/assessment.json) drawn as
// boxes in three rows, with labelled arrows taken from the assessment's diagram. Parts whose
// files are being changed by a running task glow, and so do the arrows that touch them.
// Each part carries its label (Working, Partly built…) and the evidence for that label.

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Assessment } from "@/lib/assessment";
import { LAYERS, layerOf, edgesFromMermaid, PART_STATUS, partReason } from "@/lib/live-build";
import { routeWires, checkWires, gapFor, type Wire } from "@/lib/wire-route";

const TONE_BORDER: Record<string, string> = {
  good: "border-good/45",
  warn: "border-warn/50",
  bad: "border-bad/55",
  muted: "border-border",
};
const TONE_DOT: Record<string, string> = { good: "bg-good", warn: "bg-warn", bad: "bg-bad", muted: "bg-muted" };
const TONE_PILL: Record<string, string> = {
  good: "text-good border-good/40 bg-good/10",
  warn: "text-warn border-warn/40 bg-warn/10",
  bad: "text-bad border-bad/40 bg-bad/10",
  muted: "text-muted border-border",
};

export default function PartsMap({ assessment, changing }: { assessment: Assessment; changing?: Set<string> }) {
  const comps = assessment.components || [];
  const edges = useMemo(
    () => edgesFromMermaid(assessment.architecture?.mermaid || "", comps),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [assessment.generatedAt, comps.length]
  );
  const [sel, setSel] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const nodes = useRef(new Map<string, HTMLButtonElement>());
  const [wires, setWires] = useState<Wire[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });
  // Each gap is sized for the arrows that run through it (more arrows, more room; none, a
  // narrow gap), and cards spread apart when a gap between them runs out of room. The spread
  // resets when the width changes.
  const bandsHere = LAYERS.map((_, li) => comps.filter((c) => layerOf(c) === li)).filter((ns) => ns.length);
  const [space, setSpace] = useState<{ bands: { gap: number; head: number; row: number }[]; end: number; spread: number; width: number }>({
    bands: [],
    end: 40,
    spread: 0,
    width: 0,
  });
  const changingKey = [...(changing || [])].sort().join("|");
  const isChanging = (name: string) => !!changing?.has(name);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const draw = () => {
      const B = el.getBoundingClientRect();
      const rel = (r: DOMRect) => ({ l: r.left - B.left, r: r.right - B.left, t: r.top - B.top, b: r.bottom - B.top });
      const cards = new Map<string, ReturnType<typeof rel>>();
      for (const [name, node] of nodes.current) cards.set(name, rel(node.getBoundingClientRect()));
      const obstacles = [...el.querySelectorAll("[data-heading]")].map((h) => rel(h.getBoundingClientRect()));
      const inp = {
        width: B.width,
        cards,
        obstacles,
        edges: edges.map((e) => ({ ...e, hot: isChanging(e.from) || isChanging(e.to) })),
      };
      const out = routeWires(inp);
      const width = Math.round(B.width);
      const L = out.lanes;
      const bands = bandsHere.map((ns, bi) => {
        const first = ns[0].name;
        const firstRow = L.rowOf.get(first);
        const rest = ns.filter((c) => L.rowOf.get(c.name) !== firstRow).map((c) => L.aboveCard.get(c.name) || 0);
        return {
          gap: bi === 0 ? 0 : Math.max(36, gapFor(L.aboveHeading[bi] || 0)),
          head: Math.max(14, gapFor(L.aboveCard.get(first) || 0) - 12),
          row: Math.max(28, gapFor(Math.max(0, ...rest))),
        };
      });
      const end = Math.max(24, gapFor(L.end));
      setSpace((sp) => {
        const baseSpread = sp.width === width ? sp.spread : 0;
        const spread = out.crowded ? Math.min(3, baseSpread + 1) : baseSpread;
        const next = { bands, end, spread, width };
        return JSON.stringify(next) === JSON.stringify(sp) ? sp : next;
      });
      // Measured, not eyeballed: anything an arrow or label does wrong is counted here.
      const faults = checkWires(inp, out);
      el.dataset.wireFaults = String(faults.length);
      (el as any).__wireFaults = faults;
      if (faults.length && process.env.NODE_ENV !== "production") console.warn("Parts diagram:", faults);
      setWires(out);
      setSize({ w: B.width, h: B.height });
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(el);
    for (const n of nodes.current.values()) ro.observe(n);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edges, changingKey, comps.length, sel, JSON.stringify(space)]);

  if (!comps.length) return null;
  const selected = comps.find((c) => c.name === sel) || null;
  const present = [...new Set(comps.map((c) => c.status))];
  const when = assessment.generatedAt ? new Date(assessment.generatedAt).toLocaleDateString() : null;

  return (
    <figure className="m-0">
      <div
        ref={box}
        className="relative flex flex-col pt-1"
        style={{ paddingBottom: space.end, paddingLeft: 28 + space.spread * 8, paddingRight: 28 + space.spread * 8 }}
        role="group"
        aria-label="Parts of this project and how they connect"
      >
        <svg
          className="absolute inset-0 pointer-events-none overflow-visible"
          width={size.w}
          height={size.h}
          viewBox={`0 0 ${size.w || 1} ${size.h || 1}`}
          aria-hidden="true"
        >
          {wires.map((w, i) => (
            <g key={i}>
              <path d={w.d} fill="none" className={w.hot ? "stroke-accent bw-wire-hot" : "stroke-muted"} strokeWidth={w.hot ? 2 : 1.4} opacity={w.hot ? 1 : 0.7} />
              <polygon points={w.ah} className={w.hot ? "fill-accent" : "fill-muted"} />
              {w.label && (
                <text x={w.lx} y={w.ly} textAnchor="middle" className={`bw-wire-label text-[11px] ${w.hot ? "fill-accent" : "fill-muted"}`}>
                  {w.label}
                </text>
              )}
            </g>
          ))}
        </svg>
        {bandsHere.map((ns, bi) => {
          const label = LAYERS[layerOf(ns[0])];
          const sp = space.bands[bi] || { gap: bi ? 64 : 0, head: 30, row: 48 };
          return (
            <div key={label} data-band className="relative z-[1]" style={{ marginTop: sp.gap }}>
              <div className="text-[10.5px] uppercase tracking-[0.08em] text-muted font-semibold" style={{ marginBottom: sp.head }}>
                <span data-heading>{label}</span>
              </div>
              <div className="flex flex-wrap" style={{ columnGap: 40 + space.spread * 16, rowGap: sp.row }}>
                {ns.map((c) => {
                  const st = PART_STATUS[c.status] || PART_STATUS.unknown;
                  const ch = isChanging(c.name);
                  const why = partReason(c);
                  return (
                    <button
                      key={c.name}
                      ref={(el) => {
                        if (el) nodes.current.set(c.name, el);
                        else nodes.current.delete(c.name);
                      }}
                      onClick={() => setSel((s) => (s === c.name ? null : c.name))}
                      aria-pressed={sel === c.name}
                      className={`flex-1 basis-[150px] max-w-[230px] min-w-0 text-left rounded-xl border-[1.5px] px-3 py-2.5 flex flex-col gap-1 transition-colors hover:border-accent/50 ${
                        ch ? "border-accent bg-panel bw-glow" : `${TONE_BORDER[st.tone]} ${st.dashed ? "border-dashed bg-transparent" : "bg-panel"}`
                      } ${sel === c.name ? "ring-2 ring-text/70 ring-offset-2 ring-offset-bg" : ""}`}
                    >
                      <span className="font-semibold text-[13.5px] leading-snug">{c.name}</span>
                      <span className="text-[12px] text-muted leading-snug line-clamp-2">{c.what}</span>
                      <span className="flex items-center gap-1.5 text-[11px] text-muted mt-0.5">
                        <span className={`w-2 h-2 rounded-full ${ch ? "bg-accent" : TONE_DOT[st.tone]}`} />
                        {ch ? "Being changed now" : st.label}
                      </span>
                      {why && !ch && (
                        <span className="text-[11.5px] text-muted/90 leading-snug line-clamp-3">
                          <span className="text-text/70">{why.lead}: </span>
                          {why.text}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <figcaption className="text-[12.5px] text-muted leading-relaxed mt-4 max-w-prose">
        How the parts of this project connect, and how far along each one is. Protégé worked this out by reading the code
        {when ? ` on ${when}` : ""}; it didn&apos;t run anything. Arrows are labelled with what passes along them. Tap a part for
        the full reasons. The labels mean:
      </figcaption>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 mt-2 text-[12px]">
        {present.map((s) => {
          const st = PART_STATUS[s] || PART_STATUS.unknown;
          return (
            <div key={s} className="contents">
              <dt className="inline-flex items-center gap-1.5 text-text/90 whitespace-nowrap">
                <span className={`w-2 h-2 rounded-full ${TONE_DOT[st.tone]}`} />
                {st.label}
              </dt>
              <dd className="m-0 text-muted">{st.means}</dd>
            </div>
          );
        })}
        <div className="contents">
          <dt className="inline-flex items-center gap-1.5 text-text/90 whitespace-nowrap">
            <span className="w-2 h-2 rounded-full bg-accent" />
            Being changed now
          </dt>
          <dd className="m-0 text-muted">a task running now is editing its files</dd>
        </div>
      </dl>

      {selected && (
        <div className="mt-4 rounded-xl border border-border bg-panel-2 px-4 py-3.5" aria-live="polite">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold">{selected.name}</span>
            {(() => {
              const st = PART_STATUS[selected.status] || PART_STATUS.unknown;
              const ch = isChanging(selected.name);
              return (
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${ch ? "text-accent border-accent/50 bg-accent/10" : TONE_PILL[st.tone]}`}>
                  {ch ? "Being changed now" : st.label}
                </span>
              );
            })()}
          </div>
          <dl className="grid grid-cols-1 sm:grid-cols-[120px_minmax(0,1fr)] gap-x-4 gap-y-1.5 mt-2.5 text-[13.5px] leading-relaxed">
            <dt className="text-muted">What it is</dt>
            <dd className="m-0">{selected.what}</dd>
            <dt className="text-muted">What it does</dt>
            <dd className="m-0">{selected.does}</dd>
            <dt className="text-muted">Why &ldquo;{(PART_STATUS[selected.status] || PART_STATUS.unknown).label}&rdquo;</dt>
            <dd className="m-0">
              {selected.statusWhy?.trim() ||
                (selected.issues?.length
                  ? selected.status === "solid"
                    ? "Reading its code turned up no faults. The points below are worth watching."
                    : "Because of what was found in its code, listed below."
                  : selected.status === "solid"
                    ? "Reading its code turned up no problems."
                    : "This assessment didn't record a reason. Re-assessing the project adds one.")}
            </dd>
            {selected.issues?.length > 0 && (
              <>
                <dt className="text-muted">{selected.status === "solid" ? "To watch" : "What was found"}</dt>
                <dd className="m-0">
                  <ul className="list-disc pl-4 space-y-0.5">
                    {selected.issues.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </dd>
              </>
            )}
            <dt className="text-muted">Where it is</dt>
            <dd className="m-0 font-mono text-[12px] break-all">{selected.path}</dd>
          </dl>
        </div>
      )}
    </figure>
  );
}
