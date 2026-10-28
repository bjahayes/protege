/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  // better-sqlite3 and the agent SDK are native/node-only; keep them external to the server bundle.
  serverExternalPackages: ["better-sqlite3", "@anthropic-ai/claude-agent-sdk"],
};

export default nextConfig;
