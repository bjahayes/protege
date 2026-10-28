// Client-safe. Every call from Protégé's pages to its own API goes through apiFetch, so each
// request meets the request filter's rules (src/middleware.ts) by construction: anything other
// than GET is sent as JSON, with an empty JSON body if it has none. The access key travels as
// a cookie the browser adds by itself.

export function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const method = (init.method || "GET").toUpperCase();
  if (method === "GET" || method === "HEAD") return fetch(input, init);
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return fetch(input, { ...init, headers, body: init.body ?? "{}" });
}
