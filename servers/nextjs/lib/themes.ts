// Plain string map so callers can use `theme[key]` freely. bgGradient is
// optional in spirit but typed as string ("" when absent) to keep the
// index signature uniform.
export type ThemeTokens = Record<string, string>;

export const THEMES: Record<string, ThemeTokens> = {
  light: {
    bg: "#FFFFFF", text: "#1A1A1A", accent: "#3B82F6",
    secondary: "#F3F4F6", muted: "#6B7280", border: "#E5E7EB",
    heading: "#111827", card: "#F9FAFB", bgGradient: "",
  },
  dark: {
    bg: "#0F172A", text: "#F1F5F9", accent: "#60A5FA",
    secondary: "#1E293B", muted: "#94A3B8", border: "#334155",
    heading: "#F8FAFC", card: "#1E293B", bgGradient: "",
  },
  royal: {
    bg: "#1E1B4B", text: "#EEF2FF", accent: "#A78BFA",
    secondary: "#312E81", muted: "#A5B4FC", border: "#4338CA",
    heading: "#C7D2FE", card: "#312E81",
    bgGradient: "radial-gradient(circle at 30% 20%, #312E81 0%, #1E1B4B 55%, #0E0B2B 100%)",
  },
  ocean: {
    bg: "#0C4A6E", text: "#E0F2FE", accent: "#38BDF8",
    secondary: "#075985", muted: "#7DD3FC", border: "#0369A1",
    heading: "#BAE6FD", card: "#075985",
    bgGradient: "radial-gradient(circle at 30% 20%, #075985 0%, #0C4A6E 55%, #052238 100%)",
  },
  sunset: {
    bg: "#FFF7ED", text: "#1C1917", accent: "#F97316",
    secondary: "#FED7AA", muted: "#78716C", border: "#FDBA74",
    heading: "#7C2D12", card: "#FFEDD5", bgGradient: "",
  },
  // ── Dark maroon-gradient corporate red (Gamma-style) ───────────────────────
  // bg is a solid dark color for PPTX; bgGradient overlays in the editor.
  corporate_red: {
    bg: "#1A0808", text: "#F5E6E6", accent: "#DC2626",
    secondary: "#3B0F0F", muted: "#A78282", border: "#5A1A1A",
    heading: "#FFFAF0", card: "#2A0A0A",
    bgGradient: "radial-gradient(ellipse at 30% 20%, #4A0E0E 0%, #2A0808 45%, #0F0303 100%)",
  },
};

export const LAYOUTS = {
  title:            { key: "title",            label: "Title Slide",     icon: "Layout" },
  section_header:   { key: "section_header",   label: "Section Header",  icon: "Bookmark" },
  bullets:          { key: "bullets",          label: "Bullets",          icon: "List" },
  two_column:       { key: "two_column",       label: "Two Column",       icon: "Columns2" },
  arrow_columns:    { key: "arrow_columns",    label: "Arrow Columns",    icon: "ArrowRight" },
  image_left:       { key: "image_left",       label: "Image Left",       icon: "PanelLeft" },
  image_right:      { key: "image_right",      label: "Image Right",      icon: "PanelRight" },
  image_with_cards: { key: "image_with_cards", label: "Image + Cards",    icon: "Image" },
  stats:            { key: "stats",            label: "Stats",            icon: "BarChart" },
  big_number:       { key: "big_number",       label: "Big Number",       icon: "Hash" },
  quote:            { key: "quote",            label: "Quote",            icon: "Quote" },
  timeline:         { key: "timeline",         label: "Timeline",         icon: "GitBranch" },
  process_steps:    { key: "process_steps",    label: "Process Steps",    icon: "ListOrdered" },
  pyramid:          { key: "pyramid",          label: "Pyramid",          icon: "Triangle" },
  comparison:       { key: "comparison",       label: "Comparison",       icon: "GitFork" },
  table:            { key: "table",            label: "Comparison Table",  icon: "Table" },
  team:             { key: "team",             label: "Team",             icon: "Users" },
  team_image_grid:  { key: "team_image_grid",  label: "Team Image Grid",  icon: "Users" },
  icon_grid:        { key: "icon_grid",        label: "Icon Grid",        icon: "Grid3x3" },
  agenda:           { key: "agenda",           label: "Agenda",           icon: "List" },
  cta:              { key: "cta",              label: "Call to Action",   icon: "Megaphone" },
  code:             { key: "code",             label: "Code",             icon: "Code" },
  blank:            { key: "blank",            label: "Blank",            icon: "Square" },
  // Smart Diagrams
  funnel:               { key: "funnel",               label: "Funnel",              icon: "Filter" },
  concentric_circles:   { key: "concentric_circles",   label: "Concentric circles",  icon: "Circle" },
  venn:                 { key: "venn",                 label: "Venn diagram",        icon: "CircleDot" },
  target:               { key: "target",               label: "Target / bullseye",   icon: "Target" },
  connected_circles:    { key: "connected_circles",    label: "Connected circles",   icon: "Network" },
  // Smart Charts
  bar_chart:            { key: "bar_chart",            label: "Bar chart",           icon: "BarChart" },
  line_chart:           { key: "line_chart",           label: "Line chart",          icon: "LineChart" },
  area_chart:           { key: "area_chart",           label: "Area chart",          icon: "AreaChart" },
  pie_chart:            { key: "pie_chart",            label: "Pie chart",           icon: "PieChart" },
  donut_chart:          { key: "donut_chart",          label: "Donut chart",         icon: "Donut" },
} as const;

export type ThemeKey = keyof typeof THEMES;
export type LayoutKey = keyof typeof LAYOUTS;
