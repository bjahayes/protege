import type { Config } from "tailwindcss";

// Colours come from the theme (globals.css: :root is Classic, [data-theme="midnight"] is Midnight),
// as "r g b" channels so Tailwind's opacity forms (bg-accent/15) keep working.
const c = (name: string) => `rgb(var(--c-${name}) / <alpha-value>)`;

export default {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        bg: c("bg"),
        panel: c("panel"),
        "panel-2": c("panel-2"),
        border: c("border"),
        muted: c("muted"),
        text: c("text"),
        accent: c("accent"),
        good: c("good"),
        warn: c("warn"),
        bad: c("bad"),
        running: c("running"),
      },
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
