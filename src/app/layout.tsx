import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Providers } from "@/components/providers";
import { ConditionalChatWidget, Navbar } from "@/components/features";
import { GlobalUI } from "@/components/layout/global-ui";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Localhost | Authentic Local Experiences",
  description: "Connect with verified local hosts for authentic, small-scale experiences. Discover home-cooked meals, cultural tours, and unique adventures in any city.",
  keywords: ["travel", "local experiences", "authentic tourism", "cultural exchange", "local hosts"],
  openGraph: {
    title: "Localhost | Authentic Local Experiences",
    description: "Connect with verified local hosts for authentic, small-scale experiences.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased h-screen flex flex-col overflow-hidden`}
        suppressHydrationWarning
      >
        <Providers>
          <GlobalUI />
          <Navbar />
          <main className="flex-1 relative overflow-y-auto overflow-x-hidden flex flex-col pt-16">
            {children}
          </main>
          <ConditionalChatWidget />
        </Providers>
      </body>
    </html>
  );
}
