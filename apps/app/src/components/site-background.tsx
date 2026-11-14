"use client";

import { AsciiField } from "@/components/ascii-field";

/**
 * Site-wide animated ASCII backdrop. Fixed behind everything, never intercepts clicks, and is dimmed so
 * cards and text stay readable (cards are opaque, so the field shows in the gaps between them).
 */
export function SiteBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden opacity-[0.55]" aria-hidden="true">
      <AsciiField height="100%" fps={24} cell={{ w: 12, h: 20 }} className="h-full" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/60" />
    </div>
  );
}
