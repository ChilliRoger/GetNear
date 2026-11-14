"use client";

import { useEffect, useRef, useState } from "react";

const GLYPHS = "░▒▓█▀▄▌▐╳╱╲┼═║<>/\\|[]{}#%&*+=-_";

/**
 * Text that "decodes" from noise into the real string. The real text is always the first render, so
 * there is no layout shift and nothing is lost for crawlers or reduced-motion users.
 */
export function ScrambleText({
  text,
  className = "",
  duration = 900,
  delay = 0,
}: {
  text: string;
  className?: string;
  duration?: number;
  delay?: number;
}) {
  const [out, setOut] = useState(text);
  const started = useRef(false);

  useEffect(() => {
    setOut(text);
    started.current = false;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const timer = window.setTimeout(() => {
      started.current = true;
      const t0 = performance.now();
      const tick = (now: number) => {
        const p = Math.min(1, (now - t0) / duration);
        const locked = Math.floor(p * text.length);
        let s = "";
        for (let i = 0; i < text.length; i++) {
          const ch = text[i];
          s += i < locked || ch === " " || ch === "\n" ? ch : GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
        }
        setOut(s);
        if (p < 1) raf = requestAnimationFrame(tick);
        else setOut(text);
      };
      raf = requestAnimationFrame(tick);
    }, delay);
    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  }, [text, duration, delay]);

  return (
    <span className={className} aria-label={text}>
      <span aria-hidden="true">{out}</span>
    </span>
  );
}
