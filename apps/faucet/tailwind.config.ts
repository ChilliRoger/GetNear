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
        background: "#0b0c10",
        surface: "#13151b",
        "surface-hover": "#1a1d26",
        border: "#222634",
        foreground: "#fafafa",
        muted: "#8c94a4",
        near: {
          green: "#00ec97",
          "green-hover": "#00c980",
          card: "#13151b",
          border: "#222634",
          input: "#0c0e13",
        },
        accent: {
          blue: "#3b82f6",
          green: "#00ec97",
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
