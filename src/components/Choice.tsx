"use client";

// A two-or-more-way switch (Classic | Midnight), used by the rows in Settings.

export default function Choice<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: readonly (readonly [T, string])[];
}) {
  return (
    <div
      className="grid gap-1 rounded-md border border-border p-0.5 text-[12.5px] shrink-0"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      role="radiogroup"
      aria-label={label}
    >
      {options.map(([v, text]) => (
        <button
          key={v}
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={`px-3 py-1 rounded whitespace-nowrap ${value === v ? "bg-panel-2 text-text font-medium" : "text-muted hover:text-text"}`}
        >
          {text}
        </button>
      ))}
    </div>
  );
}
