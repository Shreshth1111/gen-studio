import type { Config } from "tailwindcss";

/** Bridge a CSS custom property (RGB channels) into a Tailwind color that
 *  still supports the `/<alpha>` opacity modifier. */
const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./hooks/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
    "./store/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Artify design tokens (defined in app/globals.css)
        bg:            token("bg"),
        surface:       token("surface"),
        "surface-2":   token("surface-2"),
        line:          token("line"),
        "line-strong": token("line-strong"),
        text:          token("text"),
        muted:         token("muted"),
        faint:         token("faint"),
        brand: {
          DEFAULT: token("brand"),
          hover:   token("brand-hover"),
          soft:    token("brand-soft"),
          fg:      token("brand-fg"),
        },
        success: token("success"),
        warning: token("warning"),
        danger:  token("danger"),
      },
      borderRadius: {
        sm: "var(--r-sm)",
        md: "var(--r-md)",
        lg: "var(--r-lg)",
        xl: "var(--r-xl)",
      },
      fontSize: {
        // Tighter, more deliberate display sizes
        "display": ["2.5rem", { lineHeight: "1.05", letterSpacing: "-0.02em", fontWeight: "700" }],
      },
      animation: {
        shimmer: "shimmer 1.8s ease-in-out infinite",
        "pulse-slow": "pulse 2.5s cubic-bezier(0.4,0,0.6,1) infinite",
        "spin-slow": "spin 2s linear infinite",
        "fade-in": "fadeIn 0.3s ease-out",
        "slide-up": "slideUp 0.4s cubic-bezier(0.34,1.56,0.64,1)",
        "float-in": "floatIn 0.4s cubic-bezier(0.22,1,0.36,1) both",
      },
      keyframes: {
        shimmer: {
          "0%": { transform: "translateX(-100%) skewX(-20deg)" },
          "100%": { transform: "translateX(200%) skewX(-20deg)" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(20px) scale(0.92)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        floatIn: {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      backdropBlur: { xs: "2px" },
      boxShadow: {
        // Elevation scale — subtle, layered, never heavy
        "e1": "0 1px 2px rgba(0,0,0,0.4)",
        "e2": "0 4px 16px -4px rgba(0,0,0,0.5)",
        "e3": "0 12px 40px -8px rgba(0,0,0,0.6)",
        "glow-brand": "0 0 24px -6px rgba(109,94,247,0.55)",
        "glow-emerald": "0 0 20px -5px rgba(52,211,153,0.5)",
      },
    },
  },
  plugins: [],
};
export default config;
