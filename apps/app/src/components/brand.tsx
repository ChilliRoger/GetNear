import Link from "next/link";
import { GetNearLogo } from "@/components/getnear-logo";

export function BrandMark() {
  return (
    <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label="GetNear home">
      <GetNearLogo size={28} cropped />
      <span className="text-[16px] font-bold tracking-tight text-foreground">GetNear</span>
      <span className="pill hidden !bg-warn/15 !text-warn sm:inline-flex">Testnet</span>
    </Link>
  );
}
