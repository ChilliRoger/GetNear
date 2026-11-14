import Link from "next/link";

/** Header brand: the GetNear mark (N with trade arrows) + a white/green wordmark, matching the logo file. */
export function BrandMark() {
  return (
    <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label="GetNear home">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/getnear-mark.png" alt="" width={34} height={34} className="h-[34px] w-[34px] object-contain" />
      <span className="font-brand text-[21px] font-extrabold leading-none tracking-[-0.03em]">
        <span className="text-foreground">Get</span>
        <span className="text-brand">Near</span>
      </span>
      <span className="pill hidden !bg-warn/15 !text-warn sm:inline-flex">Testnet</span>
    </Link>
  );
}
