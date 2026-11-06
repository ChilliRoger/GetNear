import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { I18nProvider } from "@/lib/i18n";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Meridian FX — The Treasury System for the Stablecoin Era",
  description:
    "AI treasury agent replacing $120B/year in bank FX fees. Autonomous USDC/EURC conversion powered by Chainlink CRE, Uniswap, and Circle Arc.",
  openGraph: {
    title: "Meridian FX",
    description: "Autonomous treasury FX for the stablecoin era",
    type: "website",
    url: "https://meridian.omnipass.world",
  },
  twitter: {
    card: "summary_large_image",
    title: "Meridian FX",
    description: "Autonomous treasury FX for the stablecoin era",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} min-h-screen bg-background font-[family-name:var(--font-geist-sans)] text-foreground antialiased`}
      >
        <I18nProvider>{children}</I18nProvider>
      </body>
    </html>
  );
}
