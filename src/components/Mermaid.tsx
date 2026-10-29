"use client";

import { useEffect, useRef, useState } from "react";

let mermaidPromise: Promise<any> | null = null;
let themedFor = "";

/** The theme's colours, read from the page, so the flowchart matches whichever look is chosen. */
function themeVars() {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim();
  const look = document.documentElement.dataset.theme || "classic";
  const midnight = look === "midnight";
  const paper = look === "paper";
  return {
    key: look,
    light: paper,
    vars: {
      background: v("--panel"),
      primaryColor: v("--panel-2"),
      primaryBorderColor: midnight ? v("--edge") : paper ? v("--text") : v("--accent"),
      primaryTextColor: v("--text"),
      lineColor: v("--muted"),
      fontFamily: midnight ? "Geist, Inter, system-ui, sans-serif" : paper ? "'Source Sans 3', system-ui, sans-serif" : "ui-sans-serif, system-ui, sans-serif",
      fontSize: "13px",
    },
  };
}

async function getMermaid() {
  if (!mermaidPromise) mermaidPromise = import("mermaid").then((m) => m.default);
  const mermaid = await mermaidPromise;
  const t = themeVars();
  if (themedFor !== t.key) {
    mermaid.initialize({ startOnLoad: false, theme: t.light ? "base" : "dark", securityLevel: "strict", themeVariables: t.vars });
    themedFor = t.key;
  }
  return mermaid;
}

let counter = 0;

export default function Mermaid({ chart }: { chart: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const [svg, setSvg] = useState<string>("");
  // Redraw when the look is switched.
  const [look, setLook] = useState(0);
  useEffect(() => {
    const on = () => setLook((n) => n + 1);
    window.addEventListener("protege-theme", on);
    return () => window.removeEventListener("protege-theme", on);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const id = `mmd-${counter++}`;
    getMermaid()
      .then((mermaid) => mermaid.render(id, chart))
      .then(({ svg }: { svg: string }) => {
        if (!cancelled) {
          // Mermaid shrinks the chart to fit its box, which makes the labels unreadably small in a
          // narrow column. Keep it at its own size and let the box scroll sideways instead.
          const natural = svg.match(/max-width:\s*([\d.]+)px/)?.[1];
          setSvg(natural ? svg.replace(/width="100%"/, `width="${natural}"`) : svg);
          setErr(null);
        }
      })
      .catch((e) => {
        if (!cancelled) setErr(String(e?.message || e));
      });
    return () => {
      cancelled = true;
    };
  }, [chart, look]);

  if (err) {
    return (
      <div className="my-3 rounded-lg border border-bad/30 bg-bad/5 p-3">
        <div className="text-bad text-xs mb-1">Diagram failed to render</div>
        <pre className="text-[11px] text-muted overflow-x-auto">{chart}</pre>
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className="my-4 flex rounded-lg border border-border bg-panel-2/40 p-4 overflow-x-auto [&>svg]:shrink-0"
      // "safe center": centred when it fits, starting at the left edge (so nothing is cut off) when it scrolls.
      style={{ justifyContent: "safe center" }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
