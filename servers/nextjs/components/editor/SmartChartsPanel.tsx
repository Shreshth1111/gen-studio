"use client";
import React from "react";
import { motion } from "framer-motion";
import { Check } from "lucide-react";

export interface SmartChartsPanelProps {
  current: string;
  onPick: (key: string) => void;
  disabled?: boolean;
}

const ACC = "#DC2626";
const EM = "#10B981";
const AM = "#F59E0B";
const FG = "#94A3B8";

const Frame = ({ children }: { children: React.ReactNode }) => (
  <svg viewBox="0 0 64 40" className="w-full h-full">
    <rect x={0} y={0} width={64} height={40} rx={3} fill="#0F172A" opacity={0.5} />
    {children}
  </svg>
);

const previews: Record<string, React.ReactNode> = {
  bar_chart: (
    <Frame>
      {[[8,24,12],[20,16,20],[32,28,8],[44,12,24]].map(([x,y,h], i) => (
        <rect key={i} x={x} y={y} width={6} height={h} rx={1} fill={[ACC, EM, AM, ACC][i % 4]} />
      ))}
      <line x1={4} x2={60} y1={36} y2={36} stroke={FG} strokeWidth={0.5} opacity={0.6} />
    </Frame>
  ),
  line_chart: (
    <Frame>
      <polyline
        points="6,30 18,22 30,26 42,14 54,18"
        fill="none"
        stroke={ACC}
        strokeWidth={2}
      />
      {[[6,30],[18,22],[30,26],[42,14],[54,18]].map(([x,y], i) => (
        <circle key={i} cx={x} cy={y} r={1.5} fill={ACC} />
      ))}
      <line x1={4} x2={60} y1={36} y2={36} stroke={FG} strokeWidth={0.5} opacity={0.6} />
    </Frame>
  ),
  area_chart: (
    <Frame>
      <polygon points="6,30 18,20 30,24 42,12 54,16 54,36 6,36" fill={ACC} opacity={0.4} />
      <polyline points="6,30 18,20 30,24 42,12 54,16" fill="none" stroke={ACC} strokeWidth={1.5} />
      <line x1={4} x2={60} y1={36} y2={36} stroke={FG} strokeWidth={0.5} opacity={0.6} />
    </Frame>
  ),
  pie_chart: (
    <Frame>
      <path d="M32,20 L32,4 A16,16 0 0,1 48,20 Z" fill={ACC} />
      <path d="M32,20 L48,20 A16,16 0 0,1 24,33.86 Z" fill={EM} />
      <path d="M32,20 L24,33.86 A16,16 0 0,1 32,4 Z" fill={AM} />
    </Frame>
  ),
  donut_chart: (
    <Frame>
      <path d="M32,20 L32,4 A16,16 0 0,1 48,20 L40,20 A8,8 0 0,0 32,12 Z" fill={ACC} />
      <path d="M32,20 L48,20 A16,16 0 0,1 24,33.86 L28,27 A8,8 0 0,0 40,20 Z" fill={EM} />
      <path d="M32,20 L24,33.86 A16,16 0 0,1 32,4 L32,12 A8,8 0 0,0 28,27 Z" fill={AM} />
    </Frame>
  ),
};

const items = [
  { key: "bar_chart",   label: "Bar chart" },
  { key: "line_chart",  label: "Line chart" },
  { key: "area_chart",  label: "Area chart" },
  { key: "pie_chart",   label: "Pie chart" },
  { key: "donut_chart", label: "Donut chart" },
];

export default function SmartChartsPanel({ current, onPick, disabled }: SmartChartsPanelProps) {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs uppercase tracking-wider font-medium text-slate-400">
          Smart Charts
        </p>
        <p className="text-[10px] text-slate-500 mt-0.5 leading-snug">
          Render data with bar/line/pie variants. The LLM populates plausible numbers.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {items.map((l) => {
          const isActive = l.key === current;
          return (
            <motion.button
              key={l.key}
              whileHover={{ scale: disabled ? 1 : 1.03 }}
              whileTap={{ scale: disabled ? 1 : 0.97 }}
              disabled={disabled}
              onClick={() => onPick(l.key)}
              className={`relative rounded-lg overflow-hidden border-2 transition-colors group ${
                isActive ? "border-blue-500" : "border-slate-800 hover:border-slate-600"
              } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              <div className="aspect-[16/10] bg-slate-900/80">{previews[l.key]}</div>
              <div className={`px-1.5 py-1 text-[10px] font-medium truncate ${
                isActive ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-300 group-hover:bg-slate-700"
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
      <p className="text-[10px] text-slate-500 leading-relaxed border-t border-slate-800 pt-3">
        Picking a chart regenerates this slide with the LLM choosing categories, series and values to fit your topic.
      </p>
    </div>
  );
}
