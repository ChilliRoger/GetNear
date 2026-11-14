import type { Config } from "tailwindcss";

// Semantic colour tokens live in globals.css as "R G B" triplets so Tailwind opacity modifiers keep working.
const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

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
      fontFamily: {
        sans: ["var(--font-geist-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      boxShadow: {
        card: "0 0 0 1px rgb(var(--border) / 0.6)",
        pop: "0 16px 48px -16px rgb(0 0 0 / 0.7)",
      },
      borderRadius: { DEFAULT: "6px", sm: "4px", md: "6px", lg: "8px", xl: "10px", "2xl": "12px" },
    },
  },
  plugins: [],
};
export default config;
