// Runs once when the Protégé server starts: starts the preview server on its own origin.
// (Written as Next.js documents it, so the server-only import is left out of other builds.)
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startPreviewServer } = await import("./lib/preview-server");
    startPreviewServer();
  }
}
