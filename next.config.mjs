/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  // A test copy builds and runs from its own folder, leaving the running Protégé's build alone.
  distDir: process.env.PROTEGE_DIST_DIR || ".next",
  // better-sqlite3 and the agent SDK are native/node-only; keep them external to the server bundle.
  serverExternalPackages: ["better-sqlite3", "@anthropic-ai/claude-agent-sdk"],
};

export default nextConfig;
