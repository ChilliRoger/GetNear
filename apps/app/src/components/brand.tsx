import Link from "next/link";
import { GetNearLogo } from "@/components/getnear-logo";

export function BrandMark() {
  return (
    <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label="GetNear home">
      <GetNearLogo size={28} cropped />
      <span className="text-[15px] font-bold tracking-tight text-foreground">GetNear</span>
      <span className="hidden rounded-sm border border-warn/40 bg-warn/10 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wider text-warn sm:inline">
        Testnet
      </span>
    </Link>
  );
}
