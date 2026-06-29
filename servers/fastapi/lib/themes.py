THEMES = {
    "light": {"bg": "#FFFFFF", "text": "#1A1A1A", "accent": "#3B82F6",
              "secondary": "#F3F4F6", "muted": "#6B7280", "border": "#E5E7EB",
              "heading": "#111827", "card": "#F9FAFB"},
    "dark":  {"bg": "#0F172A", "text": "#F1F5F9", "accent": "#60A5FA",
              "secondary": "#1E293B", "muted": "#94A3B8", "border": "#334155",
              "heading": "#F8FAFC", "card": "#1E293B"},
    # bgGradient mirrors lib/themes.ts so the exported .pptx background matches
    # the browser. Each entry is (hex, position%) for a radial gradient whose
    # focus sits near the top-left (≈30%/20%), exactly like the CSS.
    "royal": {"bg": "#1E1B4B", "text": "#EEF2FF", "accent": "#A78BFA",
              "secondary": "#312E81", "muted": "#A5B4FC", "border": "#4338CA",
              "heading": "#C7D2FE", "card": "#312E81",
              "bgGradient": [("#312E81", 0), ("#1E1B4B", 55), ("#0E0B2B", 100)]},
    "ocean": {"bg": "#0C4A6E", "text": "#E0F2FE", "accent": "#38BDF8",
              "secondary": "#075985", "muted": "#7DD3FC", "border": "#0369A1",
              "heading": "#BAE6FD", "card": "#075985",
              "bgGradient": [("#075985", 0), ("#0C4A6E", 55), ("#052238", 100)]},
    "sunset": {"bg": "#FFF7ED", "text": "#1C1917", "accent": "#F97316",
               "secondary": "#FED7AA", "muted": "#78716C", "border": "#FDBA74",
               "heading": "#7C2D12", "card": "#FFEDD5"},
    # Dark maroon radial gradient — matches the editor's corporate_red bgGradient.
    "corporate_red": {"bg": "#1A0808", "text": "#F5E6E6", "accent": "#DC2626",
                      "secondary": "#3B0F0F", "muted": "#A78282", "border": "#5A1A1A",
                      "heading": "#FFFAF0", "card": "#2A0A0A",
                      "bgGradient": [("#4A0E0E", 0), ("#2A0808", 45), ("#0F0303", 100)]},
}

# Hint phrases used to bias image generation prompts toward each theme palette.
THEME_IMAGE_HINTS = {
    "light":          "clean white background, soft pastel tones, bright minimal aesthetic",
    "dark":           "dark navy background, cool blue accents, modern futuristic mood",
    "royal":          "deep indigo and violet palette, luxurious purple gradients, regal mood",
    "ocean":          "deep ocean blue and cyan tones, watery aquatic palette, fresh atmosphere",
    "sunset":         "warm orange and amber tones, golden-hour lighting, soft cream background",
    "corporate_red":  "dark dramatic illustration, deep maroon and crimson palette, cinematic lighting, sepia warmth, professional editorial style",
}
