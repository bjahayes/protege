"use client";

import { useEffect, useRef, useState } from "react";

let mermaidPromise: Promise<any> | null = null;
async function getMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import("mermaid").then((m) => {
      const mermaid = m.default;
      mermaid.initialize({
        startOnLoad: false,
        theme: "dark",
        securityLevel: "strict",
        themeVariables: {
          background: "#141820",
          primaryColor: "#1b212b",
          primaryBorderColor: "#5b9dff",
          primaryTextColor: "#e6e9ee",
          lineColor: "#8b95a5",
          fontSize: "13px",
        },
      });
      return mermaid;
    });
  }
  return mermaidPromise;
}

let counter = 0;

export default function Mermaid({ chart }: { chart: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const [svg, setSvg] = useState<string>("");

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
  }, [chart]);

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
