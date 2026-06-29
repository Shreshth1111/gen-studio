"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { IconButton, Badge } from "@/lib/ui";
import { Footer } from "@/components/Footer";

/** Consistent chrome for every Studio tool: sticky header with back nav +
 *  brand + tool name, an animated ambient background, and the global footer. */
export function StudioShell({
  title, eyebrow, children,
}: {
  title: string; eyebrow: string; children: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <div className="min-h-screen flex flex-col">
      {/* ambient glow */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute -top-40 -left-32 w-[40rem] h-[40rem] rounded-full bg-brand/10 blur-[140px]" />
        <div className="absolute top-1/3 right-0 w-[32rem] h-[32rem] rounded-full bg-indigo-500/8 blur-[140px]" />
      </div>

      <header className="sticky top-0 z-30 border-b border-line bg-bg/70 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <IconButton onClick={() => router.push("/studio")} title="All tools" aria-label="Back to studio">
              <ArrowLeft className="w-4 h-4" />
            </IconButton>
            <Logo />
          </div>
          <Badge tone="brand">{eyebrow}</Badge>
        </div>
      </header>

      <main className="flex-1 w-full max-w-6xl mx-auto px-6 py-10">
        <h1 className="text-display text-text mb-1">{title}</h1>
        {children}
      </main>

      <Footer />
    </div>
  );
}
