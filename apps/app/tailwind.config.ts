import type { Config } from "tailwindcss";

// Semantic colour tokens live in globals.css as "R G B" triplets so they can switch between light and dark
// and still support Tailwind opacity modifiers (e.g. bg-brand/10).
const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  darkMode: ["class", '[data-theme="dark"]'],
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
        "surface-hover": token("surface-2"),
        "surface-2": token("surface-2"),
        border: token("border"),
        "border-bright": token("border-strong"),
        foreground: token("foreground"),
        muted: token("muted"),
        brand: token("brand"),
        info: token("info"),
        warn: token("warn"),
        danger: token("danger"),
        accent: {
          blue: token("info"),
          green: token("brand"),
          amber: token("warn"),
          red: token("danger"),
        },
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      boxShadow: {
        card: "0 1px 2px rgb(0 0 0 / 0.04), 0 1px 3px rgb(0 0 0 / 0.06)",
        pop: "0 8px 30px rgb(0 0 0 / 0.12)",
      },
    },
  },
  plugins: [],
};
export default config;
