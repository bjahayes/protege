"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";

export default function SimplePreview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [name, setName] = useState<string>("");
  const [hasPreview, setHasPreview] = useState<boolean | null>(null);
  const [nonce, setNonce] = useState(0);
  const [device, setDevice] = useState<"desktop" | "phone">("desktop");

  useEffect(() => {
    fetch(`/api/projects/${id}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        setName(j.project?.name || "Preview");
        setHasPreview(!!j.previewEntry);
      })
      .catch(() => setHasPreview(false));
  }, [id]);

  const src = `/api/preview/${id}/?v=${nonce}`;

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-border bg-panel/60">
        <Link href={`/simple/project/${id}`} className="text-accent text-sm hover:underline shrink-0">
          ← Back
        </Link>
        <div className="font-semibold truncate">{name}</div>
        <span className="text-[11px] text-good bg-good/10 border border-good/25 rounded px-1.5 py-0.5 shrink-0">
          Live preview
        </span>
        <div className="flex-1" />
        <div className="flex items-center gap-1 rounded-lg border border-border p-0.5 text-xs">
          <button
            onClick={() => setDevice("desktop")}
            className={`px-2 py-1 rounded-md ${device === "desktop" ? "bg-panel-2 text-text" : "text-muted"}`}
          >
            🖥 Computer
          </button>
          <button
            onClick={() => setDevice("phone")}
            className={`px-2 py-1 rounded-md ${device === "phone" ? "bg-panel-2 text-text" : "text-muted"}`}
          >
            📱 Phone
          </button>
        </div>
        <button
          onClick={() => setNonce((n) => n + 1)}
          className="text-xs px-2.5 py-1.5 rounded-lg border border-border text-muted hover:text-text hover:border-accent/40"
        >
          ↻ Refresh
        </button>
        <a
          href={`/api/preview/${id}/`}
          target="_blank"
          rel="noreferrer"
          className="text-xs px-2.5 py-1.5 rounded-lg border border-border text-muted hover:text-text hover:border-accent/40"
        >
          Open in new tab ↗
        </a>
      </div>

      {/* Preview surface */}
      <div className="flex-1 min-h-0 bg-panel-2/40 flex items-stretch justify-center overflow-auto">
        {hasPreview === false ? (
          <div className="m-auto text-center max-w-sm p-8">
            <div className="text-4xl mb-3">🖼️</div>
            <p className="text-sm text-muted">
              There&apos;s nothing to show yet. This works for projects that are a web page — once the
              Protégé has built one, it&apos;ll appear here.
            </p>
            <Link href={`/simple/project/${id}`} className="inline-block mt-4 text-accent text-sm hover:underline">
              ← Back to the project
            </Link>
          </div>
        ) : hasPreview === null ? (
          <div className="m-auto text-muted text-sm">Loading…</div>
        ) : (
          <iframe
            key={`${nonce}-${device}`}
            src={src}
            title={`${name} preview`}
            className={`bg-white border-0 ${
              device === "phone" ? "w-[390px] h-[780px] my-6 rounded-[28px] shadow-2xl border-8 border-black/80" : "w-full h-full"
            }`}
            sandbox="allow-scripts allow-forms allow-popups allow-modals allow-same-origin"
          />
        )}
      </div>
    </div>
  );
}
