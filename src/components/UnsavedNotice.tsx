"use client";

// Shown when Keep can't go ahead because the project has changes not yet saved in its history.
// One button saves them exactly as they are, then keeps the change.

export default function UnsavedNotice({
  message,
  files,
  busy,
  onSaveAndKeep,
}: {
  message: string;
  files?: string[];
  busy: boolean;
  onSaveAndKeep: () => void;
}) {
  const list = files || [];
  return (
    <div className="rounded-xl border border-warn/40 bg-warn/5 px-4 py-3 mb-4">
      <p className="text-sm leading-relaxed">{message}</p>
      {list.length > 0 && (
        <div className="mt-2 text-[12px] text-muted">
          The unsaved {list.length === 1 ? "file is" : `files are (${list.length})`}:{" "}
          <span className="font-mono">{list.slice(0, 6).join(", ")}</span>
          {list.length > 6 ? `, and ${list.length - 6} more` : ""}
        </div>
      )}
      <button
        onClick={onSaveAndKeep}
        disabled={busy}
        className="mt-3 px-4 py-2 rounded-xl bg-good/15 border border-good/40 text-good hover:bg-good/25 text-sm font-semibold disabled:opacity-50"
      >
        {busy ? "Saving and keeping…" : "Save them and keep this change"}
      </button>
    </div>
  );
}
