import Link from "next/link";

/**
 * Header brand: the GetNear mark (N with trade arrows) + the wordmark set in Gridbox.
 * The wordmark is an image on purpose: Gridbox is a licensed font, so only the rendered logo ships, not the font file.
 */
export function BrandMark() {
  return (
    <Link href="/" className="flex shrink-0 items-center gap-3" aria-label="GetNear home">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/getnear-mark.png" alt="" width={34} height={34} className="h-[34px] w-[34px] object-contain" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/getnear-wordmark.png" alt="GetNear" width={158} height={22} className="h-[22px] w-auto" />
      <span className="pill hidden !bg-warn/15 !text-warn sm:inline-flex">Testnet</span>
    </Link>
  );
}
