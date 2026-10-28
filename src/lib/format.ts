export function timeAgo(ms: number | null | undefined): string {
  if (!ms) return "never";
  const diff = Date.now() - ms;
  if (diff < 0) return "just now";
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

export function fmtDuration(startMs: number, endMs?: number): string {
  const end = endMs ?? Date.now();
  const s = Math.max(0, Math.floor((end - startMs) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m < 60) return `${m}m ${rem}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export function fmtTokens(n?: number): string {
  if (!n && n !== 0) return "—";
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

export function fmtCost(n?: number): string {
  if (n === undefined || n === null) return "—";
  return `$${n.toFixed(n < 1 ? 3 : 2)}`;
}

export const STATUS_COLOR: Record<string, string> = {
  starting: "text-warn",
  running: "text-running",
  idle: "text-accent",
  done: "text-good",
  error: "text-bad",
  stopped: "text-muted",
};

export const STATUS_BG: Record<string, string> = {
  starting: "bg-warn/15 text-warn border-warn/30",
  running: "bg-running/15 text-running border-running/30",
  idle: "bg-accent/15 text-accent border-accent/30",
  done: "bg-good/15 text-good border-good/30",
  error: "bg-bad/15 text-bad border-bad/30",
  stopped: "bg-muted/15 text-muted border-muted/30",
  interrupted: "bg-warn/10 text-warn/80 border-warn/20",
};
