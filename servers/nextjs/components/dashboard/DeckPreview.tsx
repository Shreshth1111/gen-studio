"use client";
import * as React from "react";
import { THEMES } from "@/lib/themes";

/** A lightweight, theme-accurate miniature of a real Artify slide. Renders
 *  with the deck's actual palette and picks one of several layouts so the
 *  grid feels like a wall of distinct, designed slides — not flat thumbnails. */
export function DeckPreview({
  theme: themeKey,
  title,
  seed,
}: {
  theme: string;
  title: string;
  seed: string;
}) {
  const t = THEMES[themeKey] || THEMES.dark;
  const bg = (t.bgGradient && t.bgGradient.length > 0) ? t.bgGradient : t.bg;
  // Deterministic layout pick so a deck always shows the same design.
  const hash = Array.from(seed).reduce((a, c) => a + c.charCodeAt(0), 0);
  const variant = hash % 4;

  const shortTitle = (title || "Untitled").slice(0, 42);

  return (
    <div className="absolute inset-0" style={{ background: bg, fontFamily: "Inter, sans-serif" }}>
      {/* accent spine */}
      <div className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: t.accent }} />

      <div className="absolute inset-0 p-4">
        {variant === 0 && (
          // Title slide
          <div className="h-full flex flex-col items-center justify-center text-center px-2">
            <div className="h-[3px] w-5 rounded-full mb-2" style={{ background: t.accent }} />
            <div className="font-bold leading-tight" style={{ color: t.heading, fontSize: 13 }}>
              {shortTitle}
            </div>
            <div className="h-1 w-16 rounded mt-2" style={{ background: t.muted, opacity: 0.5 }} />
            <div className="h-1 w-10 rounded mt-1.5" style={{ background: t.muted, opacity: 0.3 }} />
          </div>
        )}

        {variant === 1 && (
          // Bullets + side block
          <div className="h-full flex gap-3">
            <div className="flex-1 min-w-0">
              <div className="font-bold leading-tight mb-0.5 truncate" style={{ color: t.heading, fontSize: 11 }}>
                {shortTitle}
              </div>
              <div className="h-[2px] w-6 rounded mb-2.5" style={{ background: t.accent }} />
              {[0, 1, 2].map(i => (
                <div key={i} className="flex items-center gap-1.5 mb-2">
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: t.accent }} />
                  <span className="h-1.5 rounded flex-1" style={{ background: t.text, opacity: 0.35 - i * 0.04 }} />
                </div>
              ))}
            </div>
            <div className="w-2/5 rounded-md" style={{ background: t.secondary }} />
          </div>
        )}

        {variant === 2 && (
          // Stats
          <div className="h-full flex flex-col">
            <div className="font-bold leading-tight truncate" style={{ color: t.heading, fontSize: 11 }}>
              {shortTitle}
            </div>
            <div className="h-[2px] w-6 rounded mt-0.5 mb-3" style={{ background: t.accent }} />
            <div className="flex-1 grid grid-cols-3 gap-2">
              {["68%", "3.4x", "12k"].map((s, i) => (
                <div key={i} className="rounded-md flex flex-col items-center justify-center"
                  style={{ background: t.secondary }}>
                  <span className="font-black" style={{ color: t.accent, fontSize: 12 }}>{s}</span>
                  <span className="h-1 w-6 rounded mt-1" style={{ background: t.muted, opacity: 0.4 }} />
                </div>
              ))}
            </div>
          </div>
        )}

        {variant === 3 && (
          // Image-left
          <div className="h-full flex gap-3">
            <div className="w-2/5 rounded-md relative overflow-hidden" style={{ background: t.secondary }}>
              <div className="absolute inset-0 opacity-60"
                style={{ background: `linear-gradient(135deg, ${t.accent}55, transparent)` }} />
            </div>
            <div className="flex-1 min-w-0 flex flex-col justify-center">
              <div className="font-bold leading-tight mb-1 truncate" style={{ color: t.heading, fontSize: 11 }}>
                {shortTitle}
              </div>
              <div className="h-[2px] w-6 rounded mb-2" style={{ background: t.accent }} />
              <div className="h-1.5 w-full rounded mb-1.5" style={{ background: t.text, opacity: 0.3 }} />
              <div className="h-1.5 w-2/3 rounded" style={{ background: t.text, opacity: 0.22 }} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
