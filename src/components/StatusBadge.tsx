import { STATUS_BG } from "@/lib/format";

export default function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_BG[status] || "bg-panel-2 text-muted border-border";
  const live = status === "running" || status === "starting" || status === "idle";
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] font-medium ${cls}`}
    >
      {live && <span className="live-dot w-1.5 h-1.5 rounded-full bg-current" />}
      {status}
    </span>
  );
}
