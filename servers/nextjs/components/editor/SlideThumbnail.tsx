"use client";
import { motion } from "framer-motion";
import SlideRenderer from "./SlideRenderer";

interface SlideThumbnailProps {
  slide: any;
  index: number;
  isActive: boolean;
  theme: Record<string, string>;
  onClick: () => void;
}

export default function SlideThumbnail({ slide, index, isActive, theme, onClick }: SlideThumbnailProps) {
  return (
    <motion.div
      onClick={onClick}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className={`relative cursor-pointer rounded-lg overflow-hidden border-2 transition-colors ${
        isActive ? "border-blue-500 ring-2 ring-blue-500/20" : "border-slate-700 hover:border-slate-500"
      }`}
    >
      {/* Slide number badge */}
      <div className={`absolute top-1 left-1 z-10 w-5 h-5 rounded text-xs font-bold flex items-center justify-center ${
        isActive ? "bg-blue-500 text-white" : "bg-slate-800/80 text-slate-400"
      }`}>
        {index + 1}
      </div>

      {/* Miniature slide render — 960×540 canvas scaled to fit the sidebar. */}
      <div className="relative w-full overflow-hidden" style={{ aspectRatio: "16 / 9" }}>
        <div
          className="pointer-events-none absolute top-0 left-0"
          style={{ width: 960, transform: "scale(0.16)", transformOrigin: "top left" }}
        >
          <SlideRenderer slide={slide} theme={theme} editable={false} />
        </div>
      </div>

      {/* Title overlay */}
      <div className="absolute bottom-0 left-0 right-0 px-1.5 py-1 bg-slate-900/90 backdrop-blur-sm">
        <p className="text-[10px] text-slate-300 truncate leading-tight">{slide.title || "Untitled"}</p>
      </div>
    </motion.div>
  );
}
