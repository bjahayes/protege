// Stress test for the parts diagram's arrow routing (npm run test:diagram): lays out cards the way the page does
// (bands of wrapping cards under headings) at several widths, adds random arrows, runs the
// same passes as the page (route, widen the gaps to fit, route again) and counts faults with
// the same checker the page uses.
import { routeWires, checkWires, gapFor, type Rect } from "../src/lib/wire-route.ts";

let seed = Number(process.env.SEED || 7);
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);

type Opts = { gapX: number; gapY: number; bandGap: number; headGap: number; pad: number };

function layout(width: number, bands: number[], heights: number[], opts: Opts) {
  const cards = new Map<string, Rect>();
  const obstacles: Rect[] = [];
  let y = 0;
  let id = 0;
  for (const n of bands) {
    obstacles.push({ l: opts.pad, r: opts.pad + 180, t: y, b: y + 12 });
    y += 12 + opts.headGap;
    // flex-wrap with basis 150, max 230, grow
    const inner = width - 2 * opts.pad;
    const perLine = Math.max(1, Math.floor((inner + opts.gapX) / (150 + opts.gapX)));
    for (let i = 0; i < n; i += perLine) {
      const k = Math.min(perLine, n - i);
      const w = Math.min(230, (inner - opts.gapX * (k - 1)) / k);
      let x = opts.pad;
      let lineH = 0;
      for (let j = 0; j < k; j++) {
        const h = heights[id];
        cards.set(`c${id++}`, { l: x, r: x + w, t: y, b: y + h });
        lineH = Math.max(lineH, h);
        x += w + opts.gapX;
      }
      y += lineH + opts.gapY;
    }
    y += opts.bandGap - opts.gapY;
  }
  return { cards, obstacles };
}

const base: Opts = { gapX: 40, gapY: 48, bandGap: 64, headGap: 36, pad: 28 };
const reps = Number(process.env.REPS || 5);
let total = 0;
let cases = 0;
for (const width of [420, 560, 720, 900, 1200]) {
  for (const bands of [[2, 5, 1], [3, 6, 2], [4, 4, 3], [1, 8, 1]]) {
    for (let rep = 0; rep < reps; rep++) {
      const n = bands.reduce((a, b) => a + b, 0);
      const heights = Array.from({ length: n }, () => 90 + Math.floor(rnd() * 50));
      const names = Array.from({ length: n }, (_, i) => `c${i}`);
      const edges: { from: string; to: string; label: string }[] = [];
      for (let i = 0; i < Math.round(n * 1.2); i++) {
        const a = names[Math.floor(rnd() * n)];
        const b = names[Math.floor(rnd() * n)];
        if (a !== b && !edges.some((e) => e.from === a && e.to === b))
          edges.push({ from: a, to: b, label: rnd() < 0.7 ? ["fetch", "SSE events", "reads/writes", "jobs"][Math.floor(rnd() * 4)] : "" });
      }
      let opts = base;
      let lay = layout(width, bands, heights, opts);
      let inp = { width, ...lay, edges };
      let out = routeWires(inp);
      for (let pass = 0, spread = 0; pass < 4; pass++) {
        const g = Math.max(48, gapFor(out.maxLanes));
        const ns = out.crowded ? spread + 1 : spread;
        if (g === opts.gapY && ns === spread) break;
        spread = ns;
        opts = { gapY: g, headGap: g - 12, bandGap: g + 16, gapX: 40 + spread * 16, pad: 28 + spread * 8 };
        lay = layout(width, bands, heights, opts);
        inp = { width, ...lay, edges };
        out = routeWires(inp);
      }
      const faults = checkWires(inp, out);
      cases++;
      total += faults.length;
      if (faults.length) console.log(`width ${width}, bands ${bands.join("/")}, rep ${rep}: ${faults.length} faults, e.g. ${faults.slice(0, 3).join("; ")}`);
    }
  }
}
console.log(`${cases} layouts, ${total} faults`);
if (total) process.exit(1);
