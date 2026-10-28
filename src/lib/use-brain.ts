"use client";

// Whether this computer has a second brain (Brainchild's notes) for Protégé to read. Most people
// don't, so the Brain page, the Brain tab and "everything I've worked on" are left out for them.
// Asked once per page load; null until the answer comes back.

import { useEffect, useState } from "react";
import { apiFetch } from "./api-client";

let known: boolean | null = null;
let asking: Promise<boolean> | null = null;

export function useBrainAvailable(): boolean | null {
  const [available, setAvailable] = useState<boolean | null>(known);
  useEffect(() => {
    if (known !== null) return;
    asking ||= apiFetch("/api/brain/status", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => (known = !!j.available))
      .catch(() => (known = false));
    asking.then(setAvailable);
  }, []);
  return available;
}
