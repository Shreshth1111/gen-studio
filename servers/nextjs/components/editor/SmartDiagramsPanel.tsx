"use client";
import React from "react";
import { motion } from "framer-motion";
import { Check } from "lucide-react";

/** Sister panel to SmartLayoutsPanel — picks one of the 5 smart-diagram
 *  layout types. Tiny SVG previews so the user picks by shape, not name. */

export interface SmartDiagramsPanelProps {
  current: string;
  onPick: (key: string) => void;
  disabled?: boolean;
}

const ACC = "#DC2626";
const FG = "#94A3B8";

const Frame = ({ children }: { children: React.ReactNode }) => (
  <svg viewBox="0 0 64 40" className="w-full h-full">
    <rect x={0} y={0} width={64} height={40} rx={3} fill="#0F172A" opacity={0.5} />
    {children}
  </svg>
);

const previews: Record<string, React.ReactNode> = {
  funnel: (
    <Frame>
      <polygon points="6,8 58,8 50,17 14,17" fill={ACC} opacity={0.5} />
      <polygon points="14,18 50,18 42,27 22,27" fill={ACC} opacity={0.75} />
      <polygon points="22,28 42,28 34,36 30,36" fill={ACC} opacity={1} />
    </Frame>
  ),
  concentric_circles: (
    <Frame>
      <circle cx={20} cy={20} r={16} fill={ACC} opacity={0.3} />
      <circle cx={20} cy={20} r={12} fill={ACC} opacity={0.5} />
      <circle cx={20} cy={20} r={8}  fill={ACC} opacity={0.75} />
      <circle cx={20} cy={20} r={4}  fill={ACC} opacity={1} />
      <rect x={42} y={10} width={18} height={1.5} fill={FG} opacity={0.6} />
      <rect x={42} y={16} width={14} height={1.5} fill={FG} opacity={0.6} />
      <rect x={42} y={22} width={16} height={1.5} fill={FG} opacity={0.6} />
      <rect x={42} y={28} width={12} height={1.5} fill={FG} opacity={0.6} />
    </Frame>
  ),
  venn: (
    <Frame>
      <circle cx={24} cy={20} r={14} fill={ACC} opacity={0.55} />
      <circle cx={40} cy={20} r={14} fill={ACC} opacity={0.55} />
    </Frame>
  ),
  target: (
    <Frame>
      <circle cx={20} cy={20} r={16} fill={ACC} opacity={0.3} />
      <circle cx={20} cy={20} r={11} fill={ACC} opacity={0.55} />
      <circle cx={20} cy={20} r={6}  fill={ACC} opacity={0.85} />
      <circle cx={20} cy={20} r={2}  fill="#fff" />
      <line x1={2} x2={38}  y1={20} y2={20} stroke={FG} strokeWidth={0.5} opacity={0.5} />
      <line y1={2} y2={38} x1={20} x2={20} stroke={FG} strokeWidth={0.5} opacity={0.5} />
    </Frame>
  ),
  connected_circles: (
    <Frame>
      <line x1={10} x2={54} y1={20} y2={20} stroke={ACC} strokeWidth={1.5} opacity={0.5} />
      <circle cx={10} cy={20} r={6} fill={ACC} opacity={0.55} />
      <circle cx={32} cy={20} r={6} fill={ACC} opacity={0.75} />
      <circle cx={54} cy={20} r={6} fill={ACC} opacity={1} />
    </Frame>
  ),
};

const items = [
  { key: "funnel",             label: "Funnel" },
  { key: "concentric_circles", label: "Concentric circles" },
  { key: "venn",               label: "Venn diagram" },
  { key: "target",             label: "Target" },
  { key: "connected_circles",  label: "Connected circles" },
];

export default function SmartDiagramsPanel({ current, onPick, disabled }: SmartDiagramsPanelProps) {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs uppercase tracking-wider font-medium text-slate-400">
          Smart Diagrams
        </p>
        <p className="text-[10px] text-slate-500 mt-0.5 leading-snug">
          Visualise relationships, hierarchies, and flows. Click one to regenerate this slide.
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
        Picking a diagram regenerates this slide with the LLM filling in the diagram's data shape.
      </p>
    </div>
  );
}
