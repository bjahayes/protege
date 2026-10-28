// Client-safe. Routes the arrows of the "How it fits together" diagram so they never pass
// over a card or a band heading.
//
// Cards sit in rows ("lines"); a band of cards can wrap onto several lines. Every arrow is
// drawn with right angles, and only through free space:
//   - its horizontal runs sit in the gap between two lines (a "gutter"), each arrow in its own lane;
//   - when it has to pass a line of cards, it goes down a vertical gap between two cards (or the
//     margin), again in its own lane;
//   - it leaves and enters cards through their top or bottom edge, at spread-out ports.
// `checkWires` measures the result against the cards, so faults can be counted, not eyeballed.

export interface Rect {
  l: number;
  r: number;
  t: number;
  b: number;
}
export interface RouteInput {
  width: number;
  cards: Map<string, Rect>;
  /** Things arrows must not cross in the gutters, e.g. band headings. */
  obstacles: Rect[];
  edges: { from: string; to: string; label: string; hot?: boolean }[];
}
export interface Wire {
  pts: [number, number][];
  d: string;
  ah: string;
  label: string;
  lx: number;
  ly: number;
  lw: number;
  hot: boolean;
  from: string;
  to: string;
}

const LANE = 9; // spacing between parallel arrows
const PAD = 6; // keep-out around cards
const LABEL_H = 13;
const CHAR_W = 6.2;

interface Line {
  t: number;
  b: number;
  cards: Rect[];
}

/** Rows of cards; each band heading counts as a row too, so arrows go round it, not through it. */
function groupLines(cards: Rect[]): Line[] {
  const sorted = [...cards].sort((a, b) => a.t - b.t);
  const lines: Line[] = [];
  for (const c of sorted) {
    const ln = lines.find((l) => Math.abs(l.t - c.t) < 8);
    if (ln) {
      ln.cards.push(c);
      ln.b = Math.max(ln.b, c.b);
    } else lines.push({ t: c.t, b: c.b, cards: [c] });
  }
  return lines.sort((a, b) => a.t - b.t);
}

/** Free x-intervals across a line of cards, inside [0, width]. */
function freeX(line: Line, width: number): [number, number][] {
  const busy = line.cards.map((c) => [c.l - PAD, c.r + PAD] as [number, number]).sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  let x = 0;
  for (const [l, r] of busy) {
    if (l > x) out.push([x, l]);
    x = Math.max(x, r);
  }
  if (x < width) out.push([x, width]);
  return out;
}

function intersect(a: [number, number][], b: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  for (const [al, ar] of a)
    for (const [bl, br] of b) {
      const l = Math.max(al, bl);
      const r = Math.min(ar, br);
      if (r - l > 2) out.push([l, r]);
    }
  return out;
}

function rounded(pts: [number, number][], rad = 6): string {
  const p = pts.filter((q, i) => i === 0 || Math.abs(q[0] - pts[i - 1][0]) + Math.abs(q[1] - pts[i - 1][1]) > 0.5);
  if (p.length < 2) return "";
  let d = `M${p[0][0].toFixed(1)},${p[0][1].toFixed(1)}`;
  for (let i = 1; i < p.length - 1; i++) {
    const [px, py] = p[i - 1];
    const [cx, cy] = p[i];
    const [nx, ny] = p[i + 1];
    const l1 = Math.hypot(cx - px, cy - py);
    const l2 = Math.hypot(nx - cx, ny - cy);
    const r = Math.min(rad, l1 / 2, l2 / 2);
    const a = [cx - ((cx - px) / l1) * r, cy - ((cy - py) / l1) * r];
    const b = [cx + ((nx - cx) / l2) * r, cy + ((ny - cy) / l2) * r];
    d += ` L${a[0].toFixed(1)},${a[1].toFixed(1)} Q${cx.toFixed(1)},${cy.toFixed(1)} ${b[0].toFixed(1)},${b[1].toFixed(1)}`;
  }
  const last = p[p.length - 1];
  return d + ` L${last[0].toFixed(1)},${last[1].toFixed(1)}`;
}

/** Gap between rows that fits `lanes` parallel arrows with room for their labels. */
export function gapFor(lanes: number): number {
  if (!lanes) return 2 * PAD + 6;
  return Math.ceil(2 * PAD + (LABEL_H - 2) + (lanes + 1) * (LABEL_H + 2));
}

/** How many arrows run side by side in each gap, so each gap can be sized for its own load. */
export interface Lanes {
  /** Gap above the row a card is in. */
  aboveCard: Map<string, number>;
  /** Row index of each card (cards in the same row share a gap above). */
  rowOf: Map<string, number>;
  /** Gap above each band heading, by heading order. */
  aboveHeading: number[];
  /** Gap below the last row. */
  end: number;
}

/**
 * Routes the arrows. `maxLanes` is the most arrows any one row gap has to hold side by side;
 * `crowded` means a vertical gap between cards ran out of room, so the cards need spacing out.
 */
export function routeWires(inp: RouteInput): Wire[] & { maxLanes: number; crowded: boolean; lanes: Lanes } {
  let crowded = false;
  const names = [...inp.cards.keys()];
  const lines = groupLines([...names.map((n) => inp.cards.get(n)!), ...inp.obstacles]);
  const lineOf = new Map<string, number>();
  for (const n of names) {
    const c = inp.cards.get(n)!;
    lineOf.set(n, lines.findIndex((l) => l.cards.includes(c)));
  }
  // Gutter k is the free band just above line k (k = lines.length: below the last line).
  const gutter = (k: number): [number, number] => {
    const top = k === 0 ? -40 : lines[k - 1].b + PAD;
    const bot = k === lines.length ? lines[lines.length - 1].b + 36 : lines[k].t - PAD;
    return [top, Math.max(top + 2, bot)];
  };

  type Plan = {
    e: RouteInput["edges"][number];
    up: boolean; // arrow points to a card above its source
    top: string; // upper card (or the source, for same-line arrows)
    bot: string;
    same: boolean;
    gutters: number[]; // gutters holding a horizontal run, top to bottom
    chans: number[]; // x of each vertical run
    ys: number[]; // lane height of each horizontal run
    ports: { topX?: number; botX?: number };
  };
  const plans: Plan[] = [];
  for (const e of inp.edges) {
    const A = inp.cards.get(e.from);
    const C = inp.cards.get(e.to);
    if (!A || !C || e.from === e.to) continue;
    const la = lineOf.get(e.from)!;
    const lc = lineOf.get(e.to)!;
    if (la === lc) {
      plans.push({ e, up: false, top: e.from, bot: e.to, same: true, gutters: [la + 1], chans: [], ys: [], ports: {} });
      continue;
    }
    const up = lc < la;
    plans.push({
      e,
      up,
      top: up ? e.to : e.from,
      bot: up ? e.from : e.to,
      same: false,
      gutters: [],
      chans: [],
      ys: [],
      ports: {},
    });
  }

  // Ports: spread the arrows leaving or entering each card edge, ordered by where they go.
  const portUse = new Map<string, { plan: Plan; other: number; end: "topX" | "botX" }[]>();
  const addPort = (key: string, plan: Plan, other: number, end: "topX" | "botX") => {
    if (!portUse.has(key)) portUse.set(key, []);
    portUse.get(key)!.push({ plan, other, end });
  };
  const cx = (n: string) => {
    const r = inp.cards.get(n)!;
    return (r.l + r.r) / 2;
  };
  for (const p of plans) {
    addPort(`${p.top}:b`, p, cx(p.bot), "topX");
    addPort(`${p.bot}:${p.same ? "b" : "t"}`, p, cx(p.top), "botX");
  }
  // Bottom-edge ports use the left part of the edge and top-edge ports the right part, so when
  // cards line up in columns, the stub leaving one card never meets the stub entering the next.
  for (const [key, list] of portUse) {
    const r = inp.cards.get(key.split(":").slice(0, -1).join(":"))!;
    const side = key.endsWith(":b") ? [0.14, 0.46] : [0.54, 0.86];
    list.sort((a, b) => a.other - b.other);
    const W = r.r - r.l;
    list.forEach((u, i) => {
      const f = list.length === 1 ? (side[0] + side[1]) / 2 : side[0] + ((side[1] - side[0]) * i) / (list.length - 1);
      u.plan.ports[u.end] = r.l + W * f;
    });
  }

  // Vertical runs past the lines in between: one straight drop if a gap runs through all of
  // them, otherwise a gap per line with a short sideways run in each gutter between. Every
  // vertical run is registered, and a new one never takes a spot within a few pixels of one
  // already there over the same stretch.
  const vsegs: { x: number; lo: number; hi: number }[] = [];
  const clear = (x: number, lo: number, hi: number) => !vsegs.some((v) => Math.abs(v.x - x) < 6 && v.lo < hi && v.hi > lo);
  const pick = (free: [number, number][], want: number, lo: number, hi: number): number | null => {
    let best: number | null = null;
    for (const [l0, r0] of free) {
      const l = l0 + 3;
      const r = r0 - 3;
      if (r <= l) continue;
      const start = Math.min(Math.max(want, l), r);
      for (let k = 0; k < 40; k++) {
        const x = start + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (LANE - 2);
        if (x < l || x > r || !clear(x, lo, hi)) continue;
        if (best === null || Math.abs(x - want) < Math.abs(best - want)) best = x;
        break;
      }
    }
    return best;
  };
  const span = (gA: number, gB: number): [number, number] => [gutter(gA)[0], gutter(gB)[1]];
  // Register the port stubs first. A stub that lands on one already there (cards of different
  // widths in neighbouring rows can line up that way) slides along its card edge.
  const settle = (x: number, card: Rect, lo: number, hi: number): number => {
    for (let k = 0; k < 30; k++) {
      const nx = x + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 5;
      if (nx > card.l + 8 && nx < card.r - 8 && clear(nx, lo, hi)) return nx;
    }
    return x;
  };
  for (const p of plans) {
    const T = inp.cards.get(p.top)!;
    const Bc = inp.cards.get(p.bot)!;
    const g1 = gutter(lineOf.get(p.top)! + 1);
    p.ports.topX = settle(p.ports.topX ?? 0, T, T.b, g1[1]);
    vsegs.push({ x: p.ports.topX, lo: T.b, hi: g1[1] });
    const [lo, hi] = p.same ? [Bc.b, g1[1]] : [gutter(lineOf.get(p.bot)!)[0], Bc.t];
    p.ports.botX = settle(p.ports.botX ?? 0, Bc, lo, hi);
    vsegs.push({ x: p.ports.botX, lo, hi });
  }
  for (const p of plans) {
    if (p.same) continue;
    const lt = lineOf.get(p.top)!;
    const lb = lineOf.get(p.bot)!;
    const mids: number[] = [];
    for (let k = lt + 1; k < lb; k++) mids.push(k);
    if (!mids.length) {
      p.gutters = [lt + 1];
      continue;
    }
    const want = ((p.ports.topX ?? 0) + (p.ports.botX ?? 0)) / 2;
    let common: [number, number][] = [[0, inp.width]];
    for (const k of mids) common = intersect(common, freeX(lines[k], inp.width));
    const [lo, hi] = span(lt + 1, lb);
    const straight = pick(common, want, lo, hi);
    if (straight !== null) {
      p.gutters = [lt + 1, lb];
      p.chans = [straight];
      vsegs.push({ x: straight, lo, hi });
    } else {
      p.gutters = [lt + 1, ...mids.map((k) => k + 1)];
      let x = p.ports.topX ?? 0;
      for (const k of mids) {
        const [a, b] = span(k, k + 1);
        const got = pick(freeX(lines[k], inp.width), (x + (p.ports.botX ?? 0)) / 2, a, b);
        if (got === null) crowded = true;
        x = got ?? 4;
        p.chans.push(x);
        vsegs.push({ x, lo: a, hi: b });
      }
    }
  }

  // Lanes: each horizontal run in a gutter gets its own height, ordered left to right, with
  // room for a label above it.
  const runs = new Map<number, { p: Plan; i: number; x: number }[]>();
  for (const p of plans) {
    p.gutters.forEach((g, i) => {
      if (!runs.has(g)) runs.set(g, []);
      runs.get(g)!.push({ p, i, x: i === 0 ? (p.ports.topX ?? 0) : p.chans[i - 1] });
    });
  }
  let maxLanes = 1;
  const laneCount = new Map<number, number>();
  for (const [g, list] of runs) {
    maxLanes = Math.max(maxLanes, list.length);
    laneCount.set(g, list.length);
    const [top0, bot] = gutter(g);
    const top = Math.min(top0 + LABEL_H - 2, bot - 2);
    const step = Math.max(5, Math.min(LABEL_H + 2, (bot - top) / (list.length + 1)));
    list.sort((a, b) => a.x - b.x);
    const mid = (top + bot) / 2;
    list.forEach((u, k) => (u.p.ys[u.i] = mid + (k - (list.length - 1) / 2) * step));
  }

  const wires: Wire[] = [];
  for (const p of plans) {
    const T = inp.cards.get(p.top)!;
    const Bc = inp.cards.get(p.bot)!;
    const tx = p.ports.topX!;
    const bx = p.ports.botX!;
    const pts: [number, number][] = [[tx, T.b]];
    p.gutters.forEach((_, i) => {
      const xin = i === 0 ? tx : p.chans[i - 1];
      const xout = i === p.gutters.length - 1 ? bx : p.chans[i];
      pts.push([xin, p.ys[i]], [xout, p.ys[i]]);
    });
    pts.push([bx, p.same ? Bc.b : Bc.t]);
    if (p.up) pts.reverse();
    // Stop short of the card so the arrowhead tip touches its edge.
    const [ex, ey] = pts[pts.length - 1];
    const py = pts[pts.length - 2][1];
    const dir = Math.sign(ey - py) || 1;
    pts[pts.length - 1] = [ex, ey - dir * 6];
    const ang = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    const tip = [ex, ey];
    const l = [ex - 6 * Math.cos(ang) - 4 * Math.sin(ang), ey - 6 * Math.sin(ang) + 4 * Math.cos(ang)];
    const r = [ex - 6 * Math.cos(ang) + 4 * Math.sin(ang), ey - 6 * Math.sin(ang) - 4 * Math.cos(ang)];
    const ah = [tip, l, r].map((q) => q.map((v) => v.toFixed(1)).join(",")).join(" ");

    const lw = p.e.label ? p.e.label.length * CHAR_W + 8 : 0;
    wires.push({ pts, d: rounded(pts), ah, label: p.e.label, lx: 0, ly: 0, lw, hot: !!p.e.hot, from: p.e.from, to: p.e.to });
  }
  placeLabels(inp, wires);
  const lanes: Lanes = {
    aboveCard: new Map(names.map((n) => [n, laneCount.get(lineOf.get(n)!) || 0])),
    rowOf: new Map(names.map((n) => [n, lineOf.get(n)!])),
    aboveHeading: inp.obstacles.map((o) => laneCount.get(lines.findIndex((l) => l.cards.includes(o))) || 0),
    end: laneCount.get(lines.length) || 0,
  };
  return Object.assign(wires, { maxLanes, crowded, lanes });
}

function labelBox(lx: number, ly: number, lw: number): Rect {
  return { l: lx - lw / 2, r: lx + lw / 2, t: ly - LABEL_H + 3, b: ly + 3 };
}
const overlaps = (a: Rect, b: Rect) => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
function segBox(a: [number, number], b: [number, number]): Rect {
  return { l: Math.min(a[0], b[0]) - 1, r: Math.max(a[0], b[0]) + 1, t: Math.min(a[1], b[1]) - 1, b: Math.max(a[1], b[1]) + 1 };
}


/** A label hides an arrow if it lies along a horizontal stretch of it, or covers a corner or an end. */
function hides(box: Rect, w: Wire): boolean {
  for (let k = 1; k < w.pts.length; k++) {
    const a = w.pts[k - 1];
    const b = w.pts[k];
    if (Math.abs(a[1] - b[1]) < 0.5 && overlaps(segBox(a, b), box)) return true;
  }
  return w.pts.some(([x, y]) => x > box.l && x < box.r && y > box.t && y < box.b);
}

/**
 * Labels go on after every arrow is drawn, so each can avoid all of them: tried along the
 * arrow's horizontal runs first (longest first), then beside its vertical runs. A spot must
 * be clear of cards, headings, other labels and every other arrow.
 */
function placeLabels(inp: RouteInput, wires: Wire[]) {
  const solid = [...inp.cards.values(), ...inp.obstacles];
  const placed: Rect[] = [];
  for (const w of wires) {
    if (!w.label) continue;
    const segs = w.pts.slice(1).map((q, i) => [w.pts[i], q] as [[number, number], [number, number]]);
    const cands: [number, number][] = [];
    const horiz = segs.filter(([a, b]) => Math.abs(a[1] - b[1]) < 0.5).sort((a, b) => Math.abs(b[1][0] - b[0][0]) - Math.abs(a[1][0] - a[0][0]));
    for (const [a, b] of horiz) {
      const x0 = Math.min(a[0], b[0]);
      const x1 = Math.max(a[0], b[0]);
      for (const f of [0.5, 0.35, 0.65, 0.2, 0.8, 0.05, 0.95]) cands.push([x0 + (x1 - x0) * f, a[1] - 3]);
    }
    const vert = segs.filter(([a, b]) => Math.abs(a[0] - b[0]) < 0.5 && Math.abs(a[1] - b[1]) > LABEL_H + 4);
    for (const [a, b] of vert) {
      const y0 = Math.min(a[1], b[1]);
      const y1 = Math.max(a[1], b[1]);
      for (const f of [0.5, 0.3, 0.7])
        for (const side of [1, -1]) cands.push([a[0] + side * (w.lw / 2 + 4), y0 + (y1 - y0) * f + 4]);
    }
    const near = wires.filter((o) => o !== w);
    let best: [number, number] | null = null;
    let bestHits = Infinity;
    for (const [x, y] of cands) {
      const box = labelBox(x, y, w.lw);
      const hits =
        solid.filter((q) => overlaps(q, box)).length * 3 +
        placed.filter((q) => overlaps(q, box)).length * 3 +
        near.filter((o) => hides(box, o)).length * 2 +
        near.filter((o) => o.pts.slice(1).some((q, i) => overlaps(segBox(o.pts[i], q), box))).length * 0.1;
      if (hits < bestHits) {
        best = [x, y];
        bestHits = hits;
        if (hits < 0.05) break;
      }
    }
    if (best) {
      [w.lx, w.ly] = best;
      placed.push(labelBox(w.lx, w.ly, w.lw));
    }
  }
}

/**
 * Counts what the diagram must never do: an arrow crossing a card other than at its own two
 * ends, an arrow crossing a band heading, two labels overlapping, or a label on a card.
 */
export function checkWires(inp: RouteInput, wires: Wire[]): string[] {
  const faults: string[] = [];
  const hit = (a: [number, number], b: [number, number], r: Rect) => {
    const l = Math.min(a[0], b[0]);
    const rr = Math.max(a[0], b[0]);
    const t = Math.min(a[1], b[1]);
    const bb = Math.max(a[1], b[1]);
    return l < r.r - 1 && rr > r.l + 1 && t < r.b - 1 && bb > r.t + 1;
  };
  for (const w of wires) {
    for (let i = 1; i < w.pts.length; i++) {
      for (const [name, r] of inp.cards) {
        if (hit(w.pts[i - 1], w.pts[i], r)) faults.push(`arrow ${w.from}→${w.to} crosses card ${name}`);
      }
      for (const o of inp.obstacles) if (hit(w.pts[i - 1], w.pts[i], o)) faults.push(`arrow ${w.from}→${w.to} crosses a heading`);
    }
  }
  // Two arrows must never run along the same line, or they read as one.
  type Seg = { w: Wire; a: [number, number]; b: [number, number] };
  const segs: Seg[] = wires.flatMap((w) => w.pts.slice(1).map((q, i) => ({ w, a: w.pts[i], b: q })));
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const A = segs[i];
      const Bs = segs[j];
      if (A.w === Bs.w) continue;
      const av = Math.abs(A.a[0] - A.b[0]) < 0.5;
      const bv = Math.abs(Bs.a[0] - Bs.b[0]) < 0.5;
      if (av !== bv) continue;
      const k = av ? 0 : 1; // the fixed coordinate
      const m = av ? 1 : 0; // the running one
      if (Math.abs(A.a[k] - Bs.a[k]) > 3) continue;
      const lo = Math.max(Math.min(A.a[m], A.b[m]), Math.min(Bs.a[m], Bs.b[m]));
      const hi = Math.min(Math.max(A.a[m], A.b[m]), Math.max(Bs.a[m], Bs.b[m]));
      if (hi - lo > 4) faults.push(`arrows ${A.w.from}→${A.w.to} and ${Bs.w.from}→${Bs.w.to} run along the same line`);
    }
  }
  const labels = wires
    .filter((w) => w.label)
    .map((w) => ({ w, r: { l: w.lx - w.lw / 2, r: w.lx + w.lw / 2, t: w.ly - LABEL_H + 3, b: w.ly + 3 } }));
  for (let i = 0; i < labels.length; i++) {
    for (let j = i + 1; j < labels.length; j++) {
      const a = labels[i].r;
      const b = labels[j].r;
      if (a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t) faults.push(`labels "${labels[i].w.label}" and "${labels[j].w.label}" overlap`);
    }
    for (const [name, r] of inp.cards) {
      const a = labels[i].r;
      if (a.l < r.r && a.r > r.l && a.t < r.b && a.b > r.t) faults.push(`label "${labels[i].w.label}" sits on card ${name}`);
    }
    for (const o of wires) {
      if (o !== labels[i].w && hides(labels[i].r, o)) faults.push(`label "${labels[i].w.label}" hides part of arrow ${o.from}→${o.to}`);
    }
  }
  return faults;
}
