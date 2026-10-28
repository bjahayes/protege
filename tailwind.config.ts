import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0b0d10",
        panel: "#141820",
        "panel-2": "#1b212b",
        border: "#262d38",
        muted: "#8b95a5",
        text: "#e6e9ee",
        accent: "#5b9dff",
        good: "#3fb950",
        warn: "#d29922",
        bad: "#f85149",
        running: "#a371f7",
      },
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
