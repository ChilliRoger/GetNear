import type { Metadata } from "next";
import { Space_Mono } from "next/font/google";
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${spaceMono.variable} min-h-screen font-sans text-foreground antialiased`}>
        <SiteBackground />
        <SmoothScroll />
        <I18nProvider>{children}</I18nProvider>
      </body>
    </html>
  );
}
