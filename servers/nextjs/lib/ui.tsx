"use client";
/* ─────────────────────────────────────────────────────────────────────────
   Artify UI primitives.
   The single source of truth for buttons, cards, badges and inputs. Screens
   compose these — they should almost never reach for raw `bg-*`/`border-*`.
   ───────────────────────────────────────────────────────────────────────── */
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { twMerge } from "tailwind-merge";
import clsx, { type ClassValue } from "clsx";
import { Loader2 } from "lucide-react";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/* ── Button ──────────────────────────────────────────────────────────────── */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 font-semibold whitespace-nowrap rounded-md " +
    "transition-all duration-150 disabled:opacity-50 disabled:pointer-events-none select-none " +
    "active:scale-[0.98]",
  {
    variants: {
      variant: {
        primary:
          "bg-brand text-brand-fg hover:bg-brand-hover shadow-e1 hover:shadow-glow-brand",
        secondary:
          "bg-surface-2 text-text border border-line hover:border-line-strong hover:bg-line/40",
        ghost:
          "text-muted hover:text-text hover:bg-surface-2",
        outline:
          "border border-line-strong text-text hover:bg-surface-2 hover:border-faint",
        danger:
          "bg-danger/15 text-danger border border-danger/30 hover:bg-danger/25",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-10 px-4 text-sm",
        lg: "h-12 px-6 text-[15px]",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, children, disabled, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 className="w-4 h-4 animate-spin" />}
      {children}
    </button>
  ),
);
Button.displayName = "Button";

/* ── IconButton ──────────────────────────────────────────────────────────── */
const iconButtonVariants = cva(
  "inline-flex items-center justify-center rounded-md transition-colors duration-150 " +
    "disabled:opacity-40 disabled:pointer-events-none",
  {
    variants: {
      variant: {
        ghost: "text-muted hover:text-text hover:bg-surface-2",
        danger: "text-muted hover:text-danger hover:bg-danger/15",
        solid: "bg-surface-2 text-text border border-line hover:border-line-strong",
      },
      size: { sm: "w-8 h-8", md: "w-9 h-9", lg: "w-10 h-10" },
    },
    defaultVariants: { variant: "ghost", size: "md" },
  },
);

export interface IconButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof iconButtonVariants> {}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(iconButtonVariants({ variant, size }), className)} {...props} />
  ),
);
IconButton.displayName = "IconButton";

/* ── Card ────────────────────────────────────────────────────────────────── */
export function Card({
  className,
  interactive,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-lg border border-line bg-surface shadow-e1",
        interactive &&
          "cursor-pointer transition-all duration-200 hover:border-line-strong hover:shadow-e2 hover:-translate-y-0.5",
        className,
      )}
      {...props}
    />
  );
}

/* ── Badge ───────────────────────────────────────────────────────────────── */
const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold",
  {
    variants: {
      tone: {
        neutral: "bg-surface-2 text-muted border border-line",
        brand: "bg-brand-soft text-brand border border-brand/30",
        success: "bg-success/12 text-success border border-success/25",
        warning: "bg-warning/12 text-warning border border-warning/25",
        danger: "bg-danger/12 text-danger border border-danger/25",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export function Badge({
  className,
  tone,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

/* ── Input ───────────────────────────────────────────────────────────────── */
export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "w-full h-10 rounded-md bg-surface border border-line px-3.5 text-sm text-text",
      "placeholder:text-faint transition-colors",
      "focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";

/* ── Spinner ─────────────────────────────────────────────────────────────── */
export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("animate-spin", className)} />;
}
