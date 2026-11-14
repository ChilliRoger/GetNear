"use client";

import { useEffect, useRef } from "react";

const RAMP = " .·:-=+*#%@";

// Colours taken from the "Neon Harbour Ferry" piece: dusk purple -> magenta -> pink -> salmon -> peach.
const STOPS: [number, number, number][] = [
  [80, 56, 160],
  [138, 72, 176],
  [208, 96, 168],
  [255, 140, 150],
  [255, 176, 154],
  [255, 212, 168],
];
// Neon sparkles from the same piece (cyan, hot pink, amber, moon white).
const SPARKS: [number, number, number][] = [
  [63, 230, 255],
  [255, 63, 164],
  [240, 188, 104],
  [255, 251, 234],
];

function gradient(u: number): [number, number, number] {
  const x = Math.min(1, Math.max(0, u)) * (STOPS.length - 1);
  const i = Math.min(STOPS.length - 2, Math.floor(x));
  const k = x - i;
  const a = STOPS[i];
  const b = STOPS[i + 1];
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

/**
 * Interactive ASCII field: a drifting, multi-colour character wave that ripples away from the pointer.
 * Pure canvas, no dependencies. Pauses off-screen / when the tab is hidden; a single still frame for reduced motion.
 */
export function AsciiField({
  className = "",
  height = 220,
  fps = 30,
  cell = { w: 11, h: 18 },
}: {
  className?: string;
  height?: number | string;
  fps?: number;
  cell?: { w: number; h: number };
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const CW = cell.w;
    const CH = cell.h;
    let w = 0;
    let h = 0;
    let cols = 0;
    let rows = 0;
    let dpr = 1;
    let visible = true;
    let raf = 0;
    let last = 0;
    const step = 1000 / fps;
    const mouse = { x: -9999, y: -9999, active: false, t: -10 };

    const resize = () => {
      dpr = Math.min(1.5, window.devicePixelRatio || 1);
      w = cv.clientWidth;
      h = cv.clientHeight;
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.font = `${CH - 4}px ui-monospace, Menlo, Consolas, monospace`;
      ctx.textBaseline = "top";
      cols = Math.ceil(w / CW);
      rows = Math.ceil(h / CH);
    };

    const draw = (time: number) => {
      const t = time / 1000;
      ctx.clearRect(0, 0, w, h);
      const age = t - mouse.t;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = c * CW;
          const y = r * CH;
          // layered waves give a calm, drifting base
          let v =
            Math.sin(c * 0.11 + t * 0.9) * 0.5 +
            Math.sin(r * 0.23 - t * 0.7 + c * 0.05) * 0.5 +
            Math.sin((c + r * 1.6) * 0.07 + t * 0.4) * 0.6;
          v = (v + 1.6) / 3.2;

          // pointer ripple: a ring travelling outwards from the last move
          let boost = 0;
          if (mouse.active || age < 2.5) {
            const dx = x - mouse.x;
            const dy = (y - mouse.y) * 1.5;
            const d = Math.hypot(dx, dy);
            const ring = Math.sin(d * 0.07 - age * 7) * Math.exp(-d / 190) * Math.exp(-age * 0.9);
            const halo = Math.exp(-d / 110) * (mouse.active ? 0.9 : 0);
            boost = Math.max(0, ring) + halo;
            v = Math.min(1, Math.max(0, v + ring * 0.55 + halo * 0.5));
          }

          const idx = Math.min(RAMP.length - 1, Math.max(0, Math.floor(v * RAMP.length)));
          if (idx === 0) continue;

          // Position along the dusk gradient drifts across the page; the pointer pushes it toward peach.
          const u = 0.5 + 0.32 * Math.sin(c * 0.021 + t * 0.22) + 0.22 * Math.sin(r * 0.032 - t * 0.15) + boost * 0.35;
          const hot = v > 0.88;
          const [rr, gg, bb] = hot ? SPARKS[(c * 7 + r * 3 + Math.floor(t * 0.5)) % SPARKS.length] : gradient(u);
          ctx.fillStyle = `rgba(${rr | 0},${gg | 0},${bb | 0},${(0.22 + v * 0.7).toFixed(2)})`;
          ctx.fillText(RAMP[idx], x, y);
        }
      }
    };

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (!visible || document.hidden) return;
      if (now - last < step) return;
      last = now;
      draw(now);
    };

    const onMove = (e: PointerEvent) => {
      const rect = cv.getBoundingClientRect();
      const inside = e.clientY >= rect.top - 40 && e.clientY <= rect.bottom + 40;
      mouse.active = inside;
      if (inside) {
        mouse.x = e.clientX - rect.left;
        mouse.y = e.clientY - rect.top;
        mouse.t = performance.now() / 1000;
      }
    };
    const onLeave = () => {
      mouse.active = false;
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(cv);
    const io = new IntersectionObserver((es) => (visible = es[0].isIntersecting), { rootMargin: "80px" });
    io.observe(cv);
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);

    if (reduce) draw(0);
    else raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
    };
  }, [fps, cell.w, cell.h]);

  return <canvas ref={ref} aria-hidden="true" className={`block w-full ${className}`} style={{ height }} />;
}
