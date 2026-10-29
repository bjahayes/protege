"use client";

import { apiFetch } from "@/lib/api-client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { StepTrack } from "@/components/simple/GettingStarted";

interface TemplateMeta {
  id: string;
  name: string;
  emoji: string;
  blurb: string;
  whatYouGet: string;
  describeHint: string;
  needsDescription: boolean;
}

export default function SimpleNew() {
  const router = useRouter();
  const [templates, setTemplates] = useState<TemplateMeta[]>([]);
  const [picked, setPicked] = useState<TemplateMeta | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Step 2's box, brought into view when a starting point is picked.
  const describeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    apiFetch("/api/templates", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setTemplates(j.templates || []))
      .catch(() => setTemplates([]));
  }, []);

  const needsDescription = !!picked?.needsDescription;
  const create = async () => {
    if (!picked || !name.trim() || (needsDescription && !description.trim())) return;
    setBusy(true);
    setError(null);
    try {
      const r = await apiFetch("/api/projects/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId: picked.id, name: name.trim(), description: description.trim() }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) {
        setError(j.error || "Couldn't create the project.");
        setBusy(false);
        return;
      }
      // The project page carries on with the steps, showing the shaping run live if there is one.
      router.push(`/simple/project/${j.projectId}${j.jobId ? `?job=${j.jobId}` : ""}`);
      return;
    } catch {
      setError("Couldn't create the project.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <Link href="/simple" className="text-accent text-sm hover:underline">
        ← All projects
      </Link>
      <h1 className="text-2xl font-bold mt-2">Start something new</h1>
      <p className="text-muted mt-1">
        You&apos;ll start from something that already works, then shape it into what you want. These are the steps:
      </p>
      <div className="mt-3">
        <StepTrack upTo={picked ? "describe" : "choose"} />
      </div>
      <p className="text-[12.5px] text-muted mt-2">
        {picked
          ? "Now give it a name and say what it's for. Protégé shapes it from that, then you try it and ask for changes."
          : "First, pick the starting point closest to what you want."}
      </p>

      {/* Step 1 — pick a template */}
      <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
        {templates.map((t) => {
          const active = picked?.id === t.id;
          return (
            <button
              key={t.id}
              onClick={() => {
                setPicked(t);
                // Suggest the starting point's name until they type their own.
                if (!name.trim() || templates.some((o) => o.name === name)) setName(t.id === "blank" ? "" : t.name);
                setTimeout(() => describeRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
              }}
              className={`text-left rounded-2xl border p-5 transition-colors ${
                active ? "border-accent bg-accent/10" : "border-border bg-panel hover:border-accent/50"
              }`}
            >
              <div className="text-3xl mb-2">{t.emoji}</div>
              <div className="font-semibold">{t.name}</div>
              <div className="text-sm text-muted mt-0.5">{t.blurb}</div>
              <div className="text-[11px] text-muted mt-2 leading-relaxed">
                <span className="text-good">You get:</span> {t.whatYouGet}
              </div>
            </button>
          );
        })}
      </div>

      {/* Step 2 — name + describe */}
      {picked && (
        <div ref={describeRef} className="mt-6 rounded-2xl border border-accent/30 bg-accent/5 p-5">
          <label className="block text-sm font-medium mb-1">What do you want to call it?</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Client intake checklist"
            className="w-full px-3 py-2.5 rounded-xl bg-bg border border-border text-sm focus:outline-none focus:border-accent/60"
          />

          <label className="block text-sm font-medium mt-4 mb-1">
            What should it do?{" "}
            <span className="text-muted font-normal">
              {needsDescription
                ? "(Protégé builds it from this)"
                : "(optional: leave it empty to try the starter as it is, and change it after)"}
            </span>
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder={picked.describeHint}
            className="w-full px-3 py-2.5 rounded-xl bg-bg border border-border text-sm focus:outline-none focus:border-accent/60 resize-y"
          />

          {error && <p className="text-sm text-bad mt-3">{error}</p>}

          <div className="flex items-center justify-between mt-4">
            <p className="text-[11px] text-muted max-w-sm">
              It&apos;s created on your own computer, in your “Protégé Projects” folder. Nothing leaves your machine.
            </p>
            <button
              onClick={create}
              disabled={busy || !name.trim() || (needsDescription && !description.trim())}
              className="btn-main px-5 py-2.5 rounded-xl bg-accent/20 border border-accent/40 text-accent hover:bg-accent/30 text-sm font-semibold disabled:opacity-40"
            >
              {busy ? "Creating…" : description.trim() ? "Create it and shape it →" : "Create it →"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
