import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { I18nProvider } from "@/lib/i18n";
import { SmoothScroll } from "@/components/smooth-scroll";

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
      <body className={`${geistSans.variable} ${geistMono.variable} min-h-screen bg-background font-mono text-foreground antialiased`}>
        <SmoothScroll />
        <I18nProvider>{children}</I18nProvider>
      </body>
    </html>
  );
}
