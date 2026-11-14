"use client";

import { useEffect, useRef, useState } from "react";

const CELL_W = 0.6; // glyph width as a fraction of font size in the ascii-magic player (square-cell pieces)
const COLS = 192; // harbour-neon-skyline is 192 x 108 cells

/**
 * The "Neon Harbour Ferry" piece from ASCII Magic (MIT, github.com/kailashsr38/ascii-magic-art), bundled locally.
 * It plays only while on screen and holds its first frame for reduced-motion users (handled by the player).
 * The art is decoration: keep real text next to it.
 */
export function AsciiScene({ className = "", speed = 1 }: { className?: string; speed?: number }) {
  const wrap = useRef<HTMLDivElement>(null);
  const pre = useRef<HTMLPreElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let stop: (() => void) | undefined;
    let ro: ResizeObserver | undefined;
    let cancelled = false;

    (async () => {
      try {
        const [{ play }, canvasMod, piece] = await Promise.all([
          import("ascii-magic-art/runtime/player.js"),
          import("ascii-magic-art/runtime/canvas.js"),
          import("ascii-magic-art/pieces/harbour-neon-skyline.js"),
        ]);
        if (cancelled || !pre.current || !wrap.current) return;
        const cellW: number = (canvasMod as { CELL_W?: number }).CELL_W ?? CELL_W;

        const fit = () => {
          if (!pre.current || !wrap.current) return;
          const w = wrap.current.clientWidth || 1200;
          pre.current.style.fontSize = `${w / (COLS * cellW)}px`;
        };
        fit();
        stop = play(pre.current, piece, { speed });
        ro = new ResizeObserver(fit);
        ro.observe(wrap.current);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      stop?.();
      ro?.disconnect();
    };
  }, [speed]);

  return (
    <div
      ref={wrap}
      aria-hidden="true"
      className={`relative overflow-hidden [&>canvas]:absolute [&>canvas]:bottom-0 [&>canvas]:left-0 [&>canvas]:!max-w-none ${className}`}
    >
      <pre ref={pre} className="m-0 text-foreground" style={{ display: "none" }} />
      {failed && <div className="absolute inset-0 bg-gradient-to-b from-info/10 via-pink/10 to-background" />}
    </div>
  );
}
