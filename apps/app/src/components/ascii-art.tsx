"use client";

import { useEffect, useState } from "react";

interface AsciiArtProps {
  piece: string;
  size?: number;
  look?: "dots" | "ascii" | "dense" | "numbers" | "binary" | "letters" | "blocks" | "squares" | "lines" | "dither";
  speed?: number;
  still?: boolean;
  contrast?: number;
  dotSize?: number;
  density?: number;
  steps?: 0 | 3 | 5;
  className?: string;
  title?: string;
}

export function AsciiArt({
  piece,
  size = 10,
  look = "dots",
  speed = 1,
  still = false,
  contrast,
  dotSize,
  density,
  steps,
  className = "",
  title,
}: AsciiArtProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (typeof window !== "undefined" && !customElements.get("ascii-art")) {
      const script = document.createElement("script");
      script.type = "module";
      script.src = "https://www.ascii-magic.com/ascii/ascii.js";
      document.head.appendChild(script);
    }
  }, []);

  if (!mounted) {
    return (
      <div
        className={`flex items-center justify-center border border-border bg-surface/50 font-mono text-[11px] text-muted ${className}`}
        style={{ minHeight: `${size * 20}px` }}
      >
        <span className="animate-pulse">┌─ [INITIALIZING ASCII ART STREAM: {piece}] ─┐</span>
      </div>
    );
  }

  // Create custom element wrapper
  return (
    <div className={`overflow-hidden font-mono ${className}`}>
      {/* @ts-ignore */}
      <ascii-art
        piece={piece}
        size={size}
        look={look}
        speed={speed}
        still={still ? "" : undefined}
        contrast={contrast}
        dot-size={dotSize}
        density={density}
        steps={steps}
        aria-label={title || `${piece} ascii art`}
        style={{ display: "block", lineHeight: 1 }}
      />
    </div>
  );
}
