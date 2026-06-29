import * as React from "react";
import { cn } from "@/lib/ui";

/** Artify mark — two stacked slide planes with a spark cut out of the top
 *  corner. Reads as "presentation + AI". */
export function ArtifyMark({
  size = 32,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className={cn("shrink-0", className)}
      aria-hidden
    >
      <defs>
        <linearGradient id="artify-g" x1="3" y1="5" x2="23" y2="20" gradientUnits="userSpaceOnUse">
          <stop stopColor="#8B7DFF" />
          <stop offset="1" stopColor="#6D5EF7" />
        </linearGradient>
      </defs>
      {/* back plane */}
      <rect x="6" y="9" width="20" height="15" rx="3.5" fill="rgb(var(--brand) / 0.35)" />
      {/* front plane */}
      <rect x="3" y="5" width="20" height="15" rx="3.5" fill="url(#artify-g)" />
      {/* spark */}
      <path
        d="M13 8.2l1.45 3.1 3.1 1.45-3.1 1.45-1.45 3.1-1.45-3.1-3.1-1.45 3.1-1.45 1.45-3.1z"
        fill="#fff"
        fillOpacity="0.95"
      />
    </svg>
  );
}

/** Full lockup: mark + wordmark. */
export function Logo({
  className,
  showWord = true,
  size = 30,
}: {
  className?: string;
  showWord?: boolean;
  size?: number;
}) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <ArtifyMark size={size} />
      {showWord && (
        <span className="font-bold tracking-tight text-[18px] leading-none">
          <span className="text-text">Artify</span>
          <span className="bg-gradient-to-r from-[#8B7DFF] to-brand bg-clip-text text-transparent">AI</span>
        </span>
      )}
    </div>
  );
}
