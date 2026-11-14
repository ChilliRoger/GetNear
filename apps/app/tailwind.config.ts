import type { Config } from "tailwindcss";

// Semantic colour tokens live in globals.css as "R G B" triplets so Tailwind opacity modifiers keep working.
const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const mono = ["var(--font-space-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"];

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
        "brand-dark": token("brand-dark"),
        info: token("info"),
        pink: token("pink"),
        ok: token("ok"),
        warn: token("warn"),
        danger: token("danger"),
        accent: {
          blue: token("brand"),
          green: token("ok"),
          amber: token("warn"),
          red: token("danger"),
        },
      },
      // One monospace family everywhere: it is the product's voice.
      fontFamily: { sans: mono, mono },
      boxShadow: {
        // Hard offset shadow + soft glow: the neo-brutalist card.
        brutal: "6px 6px 0 0 rgb(var(--brand-dark)), 0 0 32px rgb(var(--brand) / 0.16)",
        "brutal-sm": "3px 3px 0 0 rgb(var(--brand-dark)), 0 0 18px rgb(var(--brand) / 0.14)",
        "brutal-xs": "2px 2px 0 0 rgb(var(--brand-dark))",
        pop: "0 16px 48px -16px rgb(0 0 0 / 0.8)",
      },
      borderRadius: { DEFAULT: "8px", sm: "6px", md: "8px", lg: "10px", xl: "14px", "2xl": "18px" },
    },
  },
  plugins: [],
};
export default config;
