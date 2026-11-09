import type { Metadata } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/toast";

export const metadata: Metadata = {
  title: "NEAR Faucet | Testnet USDC & EURe",
  description:
    "Official public testnet faucet for NEAR Protocol NEP-141 stablecoins. Claim testnet USDC and EURe with automated NEP-145 storage registration.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#0b0c10] text-zinc-100 antialiased selection:bg-[#00ec97] selection:text-black">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
