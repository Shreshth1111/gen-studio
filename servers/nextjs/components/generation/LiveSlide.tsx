"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, ImageIcon } from "lucide-react";
import SlideRenderer from "@/components/editor/SlideRenderer";

/** Wraps the editor's SlideRenderer with Gamma-style live progressive
 *  reveal: text fields type in character-by-character, list items fade up
 *  one at a time as the streaming partial parser surfaces them. */

interface LiveSlideProps {
  slide: {
    slide_number: number;
    layout_type: string;
    title: string;
    content: Record<string, any>;
    image_url?: string;
    image_progress?: number;
    done: boolean;
  };
  theme: Record<string, string>;
  isActive: boolean;
}

const TYPE_SPEED_MS = 12; // ms per character

/** Animate a string so the visible portion grows from `prev` toward `target`
 *  one character at a time. Handles target shrinking too (rare, e.g. when a
 *  better-parsed value replaces a stale one). */
function useTypewriter(target: string): string {
  const [shown, setShown] = useState("");
  const targetRef = useRef(target);
  targetRef.current = target;

  useEffect(() => {
    if (!target) {
      setShown("");
      return;
    }
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      setShown((cur) => {
        const t = targetRef.current;
        if (cur === t) return cur;
        if (!t.startsWith(cur)) {
          // Target diverged — snap to a common prefix
          let i = 0;
          while (i < cur.length && i < t.length && cur[i] === t[i]) i++;
          return t.slice(0, i + 1);
        }
        return t.slice(0, cur.length + 1);
      });
    };
    const id = setInterval(tick, TYPE_SPEED_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [target]);

  return shown;
}

/** Recursively walks a content object producing a typewriter-animated copy.
 *  Strings get the typewriter treatment; arrays of strings reveal one item
 *  at a time once the previous item has finished typing; arrays of objects
 *  do the same per-object. */
function useAnimatedContent(content: Record<string, any>): Record<string, any> {
  // Snapshot the keys so we don't reorder them. Use JSON to drive memoization.
  const json = useMemo(() => JSON.stringify(content || {}), [content]);
  const parsed = useMemo(() => JSON.parse(json) as Record<string, any>, [json]);

  // We can't call hooks in a loop with dynamic keys on each render safely
  // (the order would change as new keys appear). To keep it stable we
  // collect every string anywhere in the tree into a flat array of (path,
  // value), call useTypewriter once on a JOINED string, then rebuild the
  // tree from the typed prefix.
  const paths: { path: (string | number)[]; value: string }[] = [];
  const walk = (node: any, path: (string | number)[]) => {
    if (typeof node === "string") {
      paths.push({ path, value: node });
    } else if (Array.isArray(node)) {
      node.forEach((v, i) => walk(v, [...path, i]));
    } else if (node && typeof node === "object") {
      Object.keys(node).forEach((k) => walk(node[k], [...path, k]));
    }
  };
  walk(parsed, []);

  // Concatenate every string with a control-char sentinel never produced by
  // the LLM, so we can split it back into individual fields.
  const SENTINEL = "";
  const target = paths.map((p) => p.value).join(SENTINEL);
  const typed = useTypewriter(target);
  const typedParts = typed.split(SENTINEL);

  // Rebuild tree using the typed values; clone the original structure and
  // overwrite each known string slot.
  const cloneSet = (obj: any, path: (string | number)[], val: string): any => {
    if (path.length === 0) return val;
    const head = path[0];
    const rest = path.slice(1);
    if (Array.isArray(obj)) {
      const arr = obj.slice();
      arr[head as number] = cloneSet(arr[head as number], rest, val);
      return arr;
    }
    if (obj && typeof obj === "object") {
      return { ...obj, [head as string]: cloneSet(obj[head as string], rest, val) };
    }
    return val;
  };

  let out = parsed;
  paths.forEach(({ path }, i) => {
    out = cloneSet(out, path, typedParts[i] ?? "");
  });
  return out;
}

export default function LiveSlide({ slide, theme, isActive }: LiveSlideProps) {
  const animatedContent = useAnimatedContent(slide.content || {});

  // Build the slide payload SlideRenderer expects.
  const renderable = {
    id: `live-${slide.slide_number}`,
    slide_number: slide.slide_number,
    layout_type: slide.layout_type || "bullets",
    title: slide.title,
    content: animatedContent,
  };

  const showImageOverlay =
    isActive && !slide.done &&
    typeof slide.image_progress === "number" &&
    slide.image_progress < 100 &&
    !slide.image_url;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 24, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 220, damping: 26 }}
      className="relative w-full"
    >
      {/* Slide-number chip */}
      <div className="absolute -left-3 -top-3 z-20 flex items-center gap-2">
        <div
          className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm shadow-lg transition-colors ${
            isActive
              ? "bg-blue-600 text-white shadow-blue-900/40"
              : slide.done
                ? "bg-emerald-600 text-white"
                : "bg-slate-700 text-slate-300"
          }`}
        >
          {slide.slide_number}
        </div>
        {isActive && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-500/15 border border-blue-500/30 rounded-full backdrop-blur">
            <Loader2 className="w-3 h-3 animate-spin text-blue-300" />
            <span className="text-[10px] font-bold text-blue-200 uppercase tracking-wider">
              Writing
            </span>
          </div>
        )}
      </div>

      {/* Glow ring while active */}
      <motion.div
        animate={{
          opacity: isActive ? 1 : 0,
          scale: isActive ? 1.005 : 0.99,
        }}
        transition={{ duration: 0.3 }}
        className="absolute -inset-[2px] rounded-2xl bg-gradient-to-br from-blue-500/40 via-violet-500/30 to-blue-500/40 blur-md pointer-events-none"
      />

      <div className="relative">
        <SlideRenderer slide={renderable} theme={theme} editable={false} />

        {/* Image-generation overlay */}
        <AnimatePresence>
          {showImageOverlay && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute bottom-4 right-4 flex items-center gap-2 px-3 py-2 bg-slate-900/85 backdrop-blur border border-slate-700 rounded-xl text-xs text-slate-200 shadow-xl"
            >
              <ImageIcon className="w-3.5 h-3.5 text-violet-400" />
              <span>Image {Math.round(slide.image_progress ?? 0)}%</span>
              <div className="w-20 h-1 rounded-full bg-slate-700 overflow-hidden">
                <motion.div
                  animate={{ width: `${slide.image_progress ?? 0}%` }}
                  transition={{ duration: 0.4 }}
                  className="h-full bg-gradient-to-r from-violet-500 to-blue-500"
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
