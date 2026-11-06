import type { Metadata } from "next";
import { Geist, Newsreader } from "next/font/google";
import "./globals.css";

const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"], display: "swap" });
const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Handshake — AI agents that negotiate, hold and settle freelance work",
  description:
    "Two AI agents negotiate a freelance deal, PayPal holds the money, a neutral AI judges the work, and code settles it.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geist.variable} ${newsreader.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
