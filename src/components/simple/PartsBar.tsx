// A small bar on a project card: one segment per part of the project, coloured by status.

export default function PartsBar({ parts }: { parts?: { solid: number; partial: number; other: number } }) {
  if (!parts) return null;
  const total = parts.solid + parts.partial + parts.other;
  if (!total) return null;
  const words = [
    parts.solid && `${parts.solid} working`,
    parts.partial && `${parts.partial} partly built`,
    parts.other && `${parts.other} not working or unclear`,
  ]
    .filter(Boolean)
    .join(", ");
  const cells = [
    ...Array(parts.solid).fill("bg-good"),
    ...Array(parts.partial).fill("bg-warn"),
    ...Array(parts.other).fill("bg-panel-2 border border-dashed border-border"),
  ];
  return (
    <div className="mt-2.5">
      <div className="flex gap-[3px]" aria-hidden="true">
        {cells.map((c, i) => (
          <span key={i} className={`flex-1 h-1.5 rounded-sm ${c}`} />
        ))}
      </div>
      <div className="text-[11px] text-muted mt-1">
        {total} parts: {words}
      </div>
    </div>
  );
}
