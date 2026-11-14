"use client";

import { useEffect, useRef } from "react";

const RAMP = " .·:-=+*#%@";

/**
 * Interactive ASCII field: a drifting character wave that ripples away from the pointer.
 * Pure canvas, no dependencies. Pauses off-screen; renders a single still frame for reduced motion.
 */
export function AsciiField({ className = "", height = 220 }: { className?: string; height?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const CW = 11;
    const CH = 18;
    let w = 0;
    let h = 0;
    let cols = 0;
    let rows = 0;
    let dpr = 1;
    let visible = true;
    let raf = 0;
    const mouse = { x: -9999, y: -9999, active: false, t: -10 };

    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
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

          // pointer ripple: ring travelling outwards from the last move
          if (mouse.active || age < 2.5) {
            const dx = x - mouse.x;
            const dy = (y - mouse.y) * 1.5;
            const d = Math.hypot(dx, dy);
            const ring = Math.sin(d * 0.07 - age * 7) * Math.exp(-d / 170) * Math.exp(-age * 0.9);
            const halo = Math.exp(-d / 90) * (mouse.active ? 0.9 : 0);
            v = Math.min(1, Math.max(0, v + ring * 0.55 + halo * 0.5));
          }

          const idx = Math.min(RAMP.length - 1, Math.max(0, Math.floor(v * RAMP.length)));
          if (idx === 0) continue;
          const hot = v > 0.82;
          // cyan -> periwinkle -> pink as intensity rises
          const rr = hot ? 255 : Math.round(63 + v * 120);
          const gg = hot ? 140 + Math.round((1 - v) * 400) : Math.round(230 - v * 130);
          const bb = hot ? 190 : 255;
          ctx.fillStyle = `rgba(${rr},${Math.min(255, gg)},${bb},${0.18 + v * 0.7})`;
          ctx.fillText(RAMP[idx], x, y);
        }
      }
    };

    const loop = (time: number) => {
      raf = requestAnimationFrame(loop);
      if (!visible) return;
      draw(time);
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
  }, []);

  return <canvas ref={ref} aria-hidden="true" className={`block w-full ${className}`} style={{ height }} />;
}
