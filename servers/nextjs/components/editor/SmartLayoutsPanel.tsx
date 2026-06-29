"use client";
import React from "react";
import { motion } from "framer-motion";
import { Check } from "lucide-react";

// ──────────────────────────────────────────────────────────────────────────
// Smart Layouts panel — categorised, visual layout picker (Gamma-style).
// Each layout shows a tiny SVG preview that hints at its structure so the
// user can pick by sight rather than label-reading.
// ──────────────────────────────────────────────────────────────────────────

export interface SmartLayoutsPanelProps {
  current: string;
  onPick: (key: string) => void;
  disabled?: boolean;
}

interface LayoutEntry {
  key: string;
  label: string;
  preview: React.ReactNode;
}

interface Category {
  name: string;
  blurb: string;
  layouts: LayoutEntry[];
}

// ── Preview primitives ─────────────────────────────────────────────────────
// Tiny SVGs that read as miniature versions of the real layout. They share a
// 64×40 viewBox so each card is uniform. Colors use currentColor / fill props
// so they tint cleanly inside light + dark wrapper backgrounds.

const FG = "#94A3B8";
const ACC = "#DC2626";
const STR = "#475569";

const Box = ({ x, y, w, h, fill = FG, opacity = 0.35, r = 1.5 }: any) => (
  <rect x={x} y={y} width={w} height={h} rx={r} fill={fill} opacity={opacity} />
);
const Line = ({ x, y, w = 14, color = FG, opacity = 0.6 }: any) => (
  <rect x={x} y={y} width={w} height={1.2} rx={0.6} fill={color} opacity={opacity} />
);

const Frame = ({ children }: { children: React.ReactNode }) => (
  <svg viewBox="0 0 64 40" className="w-full h-full">
    <rect x={0} y={0} width={64} height={40} rx={3} fill="#0F172A" opacity={0.5} />
    {children}
  </svg>
);

// ── Per-layout preview SVGs ────────────────────────────────────────────────
const previews: Record<string, React.ReactNode> = {
  title: (
    <Frame>
      <rect x={4} y={0} width={2} height={40} fill={ACC} />
      <Line x={16} y={16} w={36} color="#F8FAFC" opacity={0.95} />
      <Line x={20} y={22} w={28} />
      <Line x={28} y={32} w={10} color={ACC} opacity={1} />
    </Frame>
  ),
  section_header: (
    <Frame>
      <rect x={4} y={0} width={3} height={40} fill={ACC} />
      <Line x={10} y={10} w={10} color={ACC} opacity={1} />
      <Line x={10} y={16} w={42} color="#F8FAFC" opacity={0.95} />
      <Line x={10} y={20} w={32} color="#F8FAFC" opacity={0.95} />
    </Frame>
  ),
  bullets: (
    <Frame>
      <Line x={4}  y={6}  w={38} color="#F8FAFC" opacity={0.9} />
      <Line x={4}  y={10} w={8}  color={ACC} opacity={1} />
      <circle cx={6} cy={18} r={1.2} fill={ACC} />
      <Line   x={10} y={17.5} w={28} />
      <circle cx={6} cy={24} r={1.2} fill={ACC} />
      <Line   x={10} y={23.5} w={32} />
      <circle cx={6} cy={30} r={1.2} fill={ACC} />
      <Line   x={10} y={29.5} w={26} />
      <Box x={46} y={6} w={14} h={28} opacity={0.45} />
    </Frame>
  ),
  two_column: (
    <Frame>
      <Line x={4} y={6} w={38} color="#F8FAFC" opacity={0.9} />
      <Box x={4}  y={12} w={26} h={24} />
      <Box x={34} y={12} w={26} h={24} />
    </Frame>
  ),
  arrow_columns: (
    <Frame>
      <Line x={4} y={6} w={38} color="#F8FAFC" opacity={0.9} />
      {[0,1,2].map(i => (
        <g key={i} transform={`translate(${4 + i*20}, 16)`}>
          <text x={0} y={6} fontSize={6} fill={ACC} fontWeight="bold">→</text>
          <Line x={0} y={10} w={14} color="#F8FAFC" opacity={0.95} />
          <Line x={0} y={14} w={12} />
        </g>
      ))}
    </Frame>
  ),
  image_left: (
    <Frame>
      <Box x={4} y={4} w={24} h={32} opacity={0.5} />
      <Line x={32} y={8} w={28} color="#F8FAFC" opacity={0.95} />
      <Line x={32} y={14} w={22} />
      <Line x={32} y={20} w={26} />
      <Line x={32} y={26} w={20} />
    </Frame>
  ),
  image_right: (
    <Frame>
      <Line x={4} y={8} w={28} color="#F8FAFC" opacity={0.95} />
      <Line x={4} y={14} w={22} />
      <Line x={4} y={20} w={26} />
      <Line x={4} y={26} w={20} />
      <Box x={36} y={4} w={24} h={32} opacity={0.5} />
    </Frame>
  ),
  image_with_cards: (
    <Frame>
      <Box x={0} y={0} w={30} h={40} opacity={0.5} />
      <Line x={34} y={6}  w={20} color={ACC} opacity={1} />
      <Line x={34} y={10} w={26} color="#F8FAFC" opacity={0.95} />
      <Box x={34} y={18} w={12} h={9} />
      <Box x={48} y={18} w={12} h={9} />
      <Box x={34} y={29} w={26} h={8} />
    </Frame>
  ),
  stats: (
    <Frame>
      <Line x={4} y={6} w={38} color="#F8FAFC" opacity={0.9} />
      {[0,1,2,3].map(i => (
        <g key={i} transform={`translate(${4 + i*15}, 14)`}>
          <Box x={0} y={0} w={13} h={22} />
          <text x={6.5} y={11} fontSize={7} fill={ACC} fontWeight="bold" textAnchor="middle">42</text>
        </g>
      ))}
    </Frame>
  ),
  big_number: (
    <Frame>
      <Line x={4} y={6} w={22} color="#F8FAFC" opacity={0.9} />
      <text x={32} y={26} fontSize={18} fill={ACC} fontWeight="900" textAnchor="middle">87</text>
      <Line x={20} y={32} w={24} color="#F8FAFC" opacity={0.7} />
    </Frame>
  ),
  quote: (
    <Frame>
      <text x={8} y={20} fontSize={20} fill={ACC} fontWeight="bold">“</text>
      <Line x={16} y={14} w={42} color="#F8FAFC" opacity={0.95} />
      <Line x={16} y={20} w={36} />
      <Line x={16} y={26} w={10} color={ACC} opacity={1} />
      <Line x={16} y={32} w={20} />
    </Frame>
  ),
  timeline: (
    <Frame>
      <Line x={4} y={6} w={38} color="#F8FAFC" opacity={0.9} />
      <rect x={4} y={20} width={56} height={0.6} fill={STR} />
      {[0,1,2,3].map(i => (
        <g key={i} transform={`translate(${8 + i*16}, 0)`}>
          <circle cx={0} cy={20.3} r={2.2} fill={ACC} />
          <text x={0} y={28} fontSize={4} fill="#F8FAFC" textAnchor="middle" opacity={0.9}>'{20+i}</text>
        </g>
      ))}
    </Frame>
  ),
  process_steps: (
    <Frame>
      <Line x={4} y={6} w={38} color="#F8FAFC" opacity={0.9} />
      {[0,1,2,3].map(i => (
        <g key={i} transform={`translate(${4 + i*15}, 14)`}>
          <Box x={0} y={0} w={11} h={22} />
          <circle cx={3} cy={4} r={2} fill={ACC} />
          <text x={3} y={5.6} fontSize={3} fill="#fff" textAnchor="middle" fontWeight="bold">{i+1}</text>
          {i < 3 && <text x={13} y={13} fontSize={5} fill={ACC} fontWeight="bold">→</text>}
        </g>
      ))}
    </Frame>
  ),
  pyramid: (
    <Frame>
      <Line x={4} y={5} w={38} color="#F8FAFC" opacity={0.9} />
      <rect x={26} y={12} width={12} height={5} rx={1} fill={ACC} opacity={0.55} />
      <rect x={20} y={19} width={24} height={5} rx={1} fill={ACC} opacity={0.7} />
      <rect x={14} y={26} width={36} height={5} rx={1} fill={ACC} opacity={0.9} />
    </Frame>
  ),
  comparison: (
    <Frame>
      <Line x={4} y={6} w={38} color="#F8FAFC" opacity={0.9} />
      <Box x={4}  y={12} w={26} h={24} />
      <text x={8}  y={20} fontSize={4} fill="#10B981" fontWeight="bold">✓</text>
      <text x={8}  y={28} fontSize={4} fill="#EF4444" fontWeight="bold">✗</text>
      <Box x={34} y={12} w={26} h={24} />
      <text x={38} y={20} fontSize={4} fill="#10B981" fontWeight="bold">✓</text>
      <text x={38} y={28} fontSize={4} fill="#EF4444" fontWeight="bold">✗</text>
    </Frame>
  ),
  table: (
    <Frame>
      <rect x={4} y={5} width={56} height={7} rx={1} fill={ACC} opacity={0.85} />
      {[0, 1, 2].map((r) => (
        <g key={r}>
          <rect x={4} y={13 + r * 7} width={56} height={6} fill={FG} opacity={r % 2 ? 0.12 : 0.05} />
          <Line x={7} y={15.5 + r * 7} w={12} color="#F8FAFC" opacity={0.8} />
          <Line x={26} y={15.5 + r * 7} w={9} />
          <Line x={44} y={15.5 + r * 7} w={9} />
        </g>
      ))}
      <line x1={23} x2={23} y1={5} y2={34} stroke={STR} strokeWidth={0.4} />
      <line x1={41} x2={41} y1={5} y2={34} stroke={STR} strokeWidth={0.4} />
    </Frame>
  ),
  team: (
    <Frame>
      <Line x={4} y={6} w={38} color="#F8FAFC" opacity={0.9} />
      {[0,1,2,3].map(i => (
        <g key={i} transform={`translate(${4 + i*15}, 14)`}>
          <Box x={0} y={0} w={11} h={22} />
          <circle cx={5.5} cy={6} r={2.5} fill={ACC} />
          <Line x={2} y={12} w={7} />
          <Line x={2} y={16} w={5} />
        </g>
      ))}
    </Frame>
  ),
  team_image_grid: (
    <Frame>
      <Line x={4} y={5} w={42} color="#F8FAFC" opacity={0.95} />
      {[0,1,2].map(i => (
        <g key={i} transform={`translate(${4 + i*20}, 12)`}>
          <Box x={0} y={0} w={17} h={16} opacity={0.55} />
          <Line x={0} y={20} w={12} color="#F8FAFC" opacity={0.9} />
          <Line x={0} y={24} w={15} />
        </g>
      ))}
    </Frame>
  ),
  icon_grid: (
    <Frame>
      <Line x={4} y={6} w={38} color="#F8FAFC" opacity={0.9} />
      {[0,1,2,3].map(i => {
        const x = 4 + (i % 2) * 30;
        const y = 14 + Math.floor(i / 2) * 12;
        return (
          <g key={i} transform={`translate(${x}, ${y})`}>
            <Box x={0} y={0} w={26} h={10} />
            <circle cx={4} cy={5} r={2} fill={ACC} />
            <Line x={8} y={4.4} w={14} />
          </g>
        );
      })}
    </Frame>
  ),
  agenda: (
    <Frame>
      <text x={4} y={20} fontSize={11} fill="#F8FAFC" fontWeight="900">Aa</text>
      <g transform="translate(28, 8)">
        {[0,1,2,3,4].map(i => (
          <g key={i} transform={`translate(0, ${i*6})`}>
            <text x={0} y={4} fontSize={4} fill={ACC} fontWeight="bold">{String(i+1).padStart(2,"0")}</text>
            <Line x={8} y={3.2} w={22} />
          </g>
        ))}
      </g>
    </Frame>
  ),
  cta: (
    <Frame>
      <Line x={6} y={12} w={50} color="#F8FAFC" opacity={0.95} />
      <Line x={10} y={18} w={42} color="#F8FAFC" opacity={0.7} />
      <rect x={22} y={26} width={20} height={7} rx={3.5} fill={ACC} />
    </Frame>
  ),
  blank: (
    <Frame>
      <rect x={4} y={4} width={56} height={32} rx={2} fill="none" stroke={FG} strokeOpacity={0.4} strokeDasharray="2 2" />
    </Frame>
  ),
  code: (
    <Frame>
      <rect x={6} y={6} width={52} height={28} rx={2} fill={FG} fillOpacity={0.12} />
      <rect x={10} y={11} width={20} height={2.5} rx={1} fill={ACC} />
      <rect x={14} y={16} width={30} height={2.5} rx={1} fill={FG} fillOpacity={0.5} />
      <rect x={18} y={21} width={22} height={2.5} rx={1} fill={FG} fillOpacity={0.5} />
      <rect x={14} y={26} width={26} height={2.5} rx={1} fill={FG} fillOpacity={0.5} />
    </Frame>
  ),
};

// ── Categorisation — Gamma-style intent groups ────────────────────────────
const categories: Category[] = [
  {
    name: "Headers",
    blurb: "Title slides and section dividers.",
    layouts: [
      { key: "title",          label: "Title slide",      preview: previews.title },
      { key: "section_header", label: "Section header",   preview: previews.section_header },
      { key: "cta",            label: "Call to action",   preview: previews.cta },
    ],
  },
  {
    name: "Content",
    blurb: "Bullets, two-column, free canvas.",
    layouts: [
      { key: "bullets",     label: "Bullets",     preview: previews.bullets },
      { key: "two_column",  label: "Two column",  preview: previews.two_column },
      { key: "blank",       label: "Blank",       preview: previews.blank },
    ],
  },
  {
    name: "Columns",
    blurb: "Parallel concepts side-by-side.",
    layouts: [
      { key: "arrow_columns", label: "Arrow columns", preview: previews.arrow_columns },
      { key: "icon_grid",     label: "Icon grid",     preview: previews.icon_grid },
    ],
  },
  {
    name: "With image",
    blurb: "Photo + text combinations.",
    layouts: [
      { key: "image_left",        label: "Image left",       preview: previews.image_left },
      { key: "image_right",       label: "Image right",      preview: previews.image_right },
      { key: "image_with_cards",  label: "Image + cards",    preview: previews.image_with_cards },
    ],
  },
  {
    name: "Numbers",
    blurb: "Stats and hero metrics.",
    layouts: [
      { key: "stats",      label: "Stats",       preview: previews.stats },
      { key: "big_number", label: "Big number",  preview: previews.big_number },
    ],
  },
  {
    name: "Sequence",
    blurb: "Steps, timelines, agendas.",
    layouts: [
      { key: "timeline",      label: "Timeline",       preview: previews.timeline },
      { key: "process_steps", label: "Process steps",  preview: previews.process_steps },
      { key: "agenda",        label: "Agenda",         preview: previews.agenda },
    ],
  },
  {
    name: "People",
    blurb: "Team and bios.",
    layouts: [
      { key: "team",            label: "Team",             preview: previews.team },
      { key: "team_image_grid", label: "Team image grid",  preview: previews.team_image_grid },
    ],
  },
  {
    name: "Comparison & hierarchy",
    blurb: "Compare options, show hierarchies.",
    layouts: [
      { key: "comparison", label: "Comparison",       preview: previews.comparison },
      { key: "table",      label: "Comparison table", preview: previews.table },
      { key: "pyramid",    label: "Pyramid",          preview: previews.pyramid },
    ],
  },
  {
    name: "Quotes",
    blurb: "Pull-quote slides.",
    layouts: [
      { key: "quote", label: "Quote", preview: previews.quote },
    ],
  },
  {
    name: "Code",
    blurb: "Show source code, not bullets.",
    layouts: [
      { key: "code", label: "Code block", preview: previews.code },
    ],
  },
];

export default function SmartLayoutsPanel({ current, onPick, disabled }: SmartLayoutsPanelProps) {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs uppercase tracking-wider font-medium text-slate-400">
          Smart Layouts
        </p>
        <p className="text-[10px] text-slate-500 mt-0.5 leading-snug">
          Visual layouts for organising key ideas. Click one to regenerate this slide.
        </p>
      </div>

      <div className="space-y-4">
        {categories.map((cat) => (
          <div key={cat.name}>
            <div className="flex items-baseline justify-between mb-1.5">
              <p className="text-[11px] font-bold text-slate-300">{cat.name}</p>
              <span className="text-[9px] text-slate-600">{cat.blurb}</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {cat.layouts.map((l) => {
                const isActive = l.key === current;
                return (
                  <motion.button
                    key={l.key}
                    whileHover={{ scale: disabled ? 1 : 1.03 }}
                    whileTap={{ scale: disabled ? 1 : 0.97 }}
                    disabled={disabled}
                    onClick={() => onPick(l.key)}
                    className={`relative rounded-lg overflow-hidden border-2 transition-colors group ${
                      isActive
                        ? "border-blue-500"
                        : "border-slate-800 hover:border-slate-600"
                    } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    <div className="aspect-[16/10] bg-slate-900/80">
                      {l.preview}
                    </div>
                    <div className={`px-1.5 py-1 text-[10px] font-medium truncate ${
                      isActive
                        ? "bg-blue-600 text-white"
                        : "bg-slate-800 text-slate-300 group-hover:bg-slate-700"
                    }`}>
                      {l.label}
                    </div>
                    {isActive && (
                      <div className="absolute top-1 right-1 w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center shadow">
                        <Check className="w-2.5 h-2.5 text-white" />
                      </div>
                    )}
                  </motion.button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <p className="text-[10px] text-slate-500 leading-relaxed border-t border-slate-800 pt-3">
        Picking a layout regenerates this slide's content to fit the new structure.
      </p>
    </div>
  );
}
