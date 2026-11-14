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

// Applied before first paint so the page never flashes the wrong theme.
const themeScript = `try{var t=localStorage.getItem("getnear_theme");if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"}document.documentElement.setAttribute("data-theme",t)}catch(e){document.documentElement.setAttribute("data-theme","dark")}`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} min-h-screen bg-background font-sans text-foreground antialiased`}
      >
        <I18nProvider>{children}</I18nProvider>
      </body>
    </html>
  );
}
