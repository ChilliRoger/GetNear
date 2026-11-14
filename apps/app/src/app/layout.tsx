import type { Metadata } from "next";
import { Space_Mono, Sora } from "next/font/google";
import "./globals.css";
import { I18nProvider } from "@/lib/i18n";
import { SmoothScroll } from "@/components/smooth-scroll";
import { SiteBackground } from "@/components/site-background";

// One monospace family for the whole product (free, Google Fonts).
const spaceMono = Space_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-space-mono",
  display: "swap",
});

// Wordmark-only display face (the rest of the product is Space Mono).
const brandFont = Sora({
  subsets: ["latin"],
  weight: ["700", "800"],
  variable: "--font-brand",
  display: "swap",
});

export const metadata: Metadata = {
  title: "GetNear — Controlled supplier payments on NEAR testnet",
  description:
    "A treasury agent that pays supplier invoices in chunks under on-chain limits and DAO approval. Testnet-only hackathon prototype; the FX conversion is simulated.",
  openGraph: {
    title: "GetNear",
    description: "Controlled supplier payments on NEAR testnet",
    type: "website",
    url: "https://github.com/ChilliRoger/GetNear",
  },
  twitter: {
    card: "summary_large_image",
    title: "GetNear",
    description: "Controlled supplier payments on NEAR testnet",
  },
};

// Browser extensions (MetaMask, etc.) inject scripts that throw unhandled errors on every page. They are not ours,
// and the Next.js dev overlay would otherwise cover the whole site. Runs first, in the capture phase.
const extensionErrorFilter = `(function(){function ext(x){var s=(x&&(x.stack||x.message))||(typeof x==="string"?x:"")||"";return s.indexOf("chrome-extension://")>-1||s.indexOf("moz-extension://")>-1||s.indexOf("safari-extension://")>-1||/MetaMask/i.test(s)}window.addEventListener("unhandledrejection",function(e){if(ext(e.reason)){e.preventDefault();e.stopImmediatePropagation()}},true);window.addEventListener("error",function(e){var f=String(e.filename||"");if(f.indexOf("extension://")>-1||ext(e.error)){e.preventDefault();e.stopImmediatePropagation()}},true)})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        <script dangerouslySetInnerHTML={{ __html: extensionErrorFilter }} />
      </head>
      <body className={`${spaceMono.variable} ${brandFont.variable} min-h-screen font-sans text-foreground antialiased`}>
        <SiteBackground />
        <SmoothScroll />
        <I18nProvider>{children}</I18nProvider>
      </body>
    </html>
  );
}
