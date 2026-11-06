import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#0a0a0a",
        surface: "#141414",
        "surface-hover": "#1a1a1a",
        border: "#262626",
        foreground: "#fafafa",
        muted: "#a3a3a3",
        accent: {
          blue: "#3b82f6",
          green: "#22c55e",
          amber: "#f59e0b",
          red: "#ef4444",
        },
      },
      fontFamily: {
        mono: ["SF Mono", "Fira Code", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
