import Link from "next/link";
import { GetNearLogo } from "@/components/getnear-logo";

export function BrandMark({ sub = "Treasury FX agent · NEAR testnet" }: { sub?: string }) {
  return (
    <Link href="/" className="group flex items-center gap-3" aria-label="GetNear home">
      <GetNearLogo size={32} cropped />
      <div className="leading-tight">
        <div className="text-sm font-bold uppercase tracking-[0.28em] text-foreground transition-colors group-hover:text-brand">
          GetNear
        </div>
        <div className="hidden text-[10px] uppercase tracking-[0.16em] text-muted sm:block">{sub}</div>
      </div>
    </Link>
  );
}
