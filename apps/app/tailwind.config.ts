import type { Config } from "tailwindcss";

// Semantic colour tokens live in globals.css as "R G B" triplets so Tailwind opacity modifiers keep working.
const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const mono = ["var(--font-geist-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"];

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: token("background"),
        surface: token("surface"),
        "surface-2": token("surface-2"),
        "surface-hover": token("surface-2"),
        border: token("border"),
        "border-bright": token("border-strong"),
        foreground: token("foreground"),
        muted: token("muted"),
        brand: token("brand"),
        info: token("info"),
        pink: token("pink"),
        ok: token("ok"),
        warn: token("warn"),
        danger: token("danger"),
        accent: {
          blue: token("info"),
          green: token("ok"),
          amber: token("warn"),
          red: token("danger"),
        },
      },
      // The whole product is set in one monospace family: it is the ASCII grid.
      fontFamily: { sans: mono, mono },
      boxShadow: {
        card: "0 0 0 1px rgb(var(--border) / 0.4)",
        pop: "0 20px 60px -20px rgb(0 0 0 / 0.8)",
      },
      borderRadius: { DEFAULT: "2px", sm: "2px", md: "2px", lg: "3px", xl: "3px", "2xl": "4px" },
    },
  },
  plugins: [],
};
export default config;
