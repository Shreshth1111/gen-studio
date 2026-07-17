import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const outfit = Outfit({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "GenStudio — AI Presentation Builder",
  description: "Turn any idea into a polished presentation in minutes — written, designed, and illustrated by AI.",
  icons: { icon: "/icon.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${outfit.className} bg-slate-950 text-white antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
