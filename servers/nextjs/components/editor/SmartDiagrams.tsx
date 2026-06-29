"use client";
import React from "react";

/**
 * Smart-diagram renderers. Each component takes `content` (the slide's
 * content JSON), a theme map, and an `onUpdate`/`editable` pair just like
 * the layouts in SlideRenderer.tsx.
 *
 * Schemas (kept simple so the LLM can produce them reliably):
 *
 *   funnel              { title, stages:    [{label, description?}, ...] }   // top→bottom
 *   concentric_circles  { title, layers:    [{label, description?}, ...] }   // outer→inner
 *   venn                { title, set_a:{label, items?:[]}, set_b:{label, items?:[]}, overlap_label?, overlap_items?:[] }
 *   target              { title, rings:     [{label, description?}, ...] }   // outer→bullseye
 *   connected_circles   { title, nodes:     [{label, description?}, ...] }   // left→right
 *
 * The renderers are deliberately SVG-based — no library, no runtime cost,
 * exports cleanly to PNG fallback if we ever need it.
 */

// ── Shared helpers ────────────────────────────────────────────────────────
function str(v: any, fb = ""): string {
  if (v === null || v === undefined) return fb;
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return fb;
}
function arr(v: any): any[] {
  return Array.isArray(v) ? v : [];
}

/** Pick black or white for text drawn ON TOP of `hex`, based on luminance.
 *  Keeps labels legible on accent-coloured shapes across every theme. */
function contrastOn(hex: string): string {
  const h = (hex || "#000000").replace("#", "");
  if (h.length < 6) return "#FFFFFF";
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  // Relative luminance (sRGB approximation).
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? "#111111" : "#FFFFFF";
}

/** Wrap a label so SVG <text> can render it across multiple <tspan>s. */
function wrapText(text: string, maxChars = 22): string[] {
  const out: string[] = [];
  const words = (text || "").split(/\s+/).filter(Boolean);
  let line = "";
  for (const w of words) {
    if ((line + " " + w).trim().length > maxChars) {
      if (line) out.push(line);
      line = w;
    } else {
      line = (line ? line + " " : "") + w;
    }
  }
  if (line) out.push(line);
  return out.length ? out : [""];
}

function TitleRow({ title, theme }: { title: string; theme: any }) {
  if (!title) return null;
  return (
    <div className="mb-3 flex-shrink-0">
      <h2 className="text-3xl font-bold leading-tight" style={{ color: theme.heading }}>
        {title}
      </h2>
      <div className="mt-2 h-1 w-12 rounded-full" style={{ backgroundColor: theme.accent }} />
    </div>
  );
}

// ── 1. Funnel ─────────────────────────────────────────────────────────────
export function FunnelDiagram({ content, theme }: any) {
  const title = str(content?.title);
  const stages = arr(content?.stages).slice(0, 5);
  const n = stages.length || 1;
  const W = 1000;
  const H = 520;
  const TOP_W = 820;
  const BOT_W = 300;
  const ROW_H = H / n;
  // One legible text colour for every slice (computed against the accent).
  const txt = contrastOn(theme.accent);
  return (
    <div className="absolute inset-0 flex flex-col p-10">
      <TitleRow title={title} theme={theme} />
      <div className="flex-1 min-h-0 flex items-center justify-center">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full">
          {stages.map((stage: any, i: number) => {
            const t0 = i / n;
            const t1 = (i + 1) / n;
            const w0 = TOP_W - (TOP_W - BOT_W) * t0;
            const w1 = TOP_W - (TOP_W - BOT_W) * t1;
            const y0 = i * ROW_H;
            const y1 = y0 + ROW_H - 6;
            const pts = [
              [W / 2 - w0 / 2, y0],
              [W / 2 + w0 / 2, y0],
              [W / 2 + w1 / 2, y1],
              [W / 2 - w1 / 2, y1],
            ]
              .map((p) => p.join(","))
              .join(" ");
            const opacity = 0.55 + (i / Math.max(n - 1, 1)) * 0.45;
            // Constrain text to the NARROW (bottom) edge so it never spills
            // past the trapezoid; wrap inside a foreignObject.
            const textW = Math.max(w1 - 36, 140);
            return (
              <g key={i}>
                <polygon points={pts} fill={theme.accent} opacity={opacity} />
                <foreignObject
                  x={W / 2 - textW / 2}
                  y={y0}
                  width={textW}
                  height={ROW_H - 6}
                >
                  <div
                    style={{
                      height: "100%",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      textAlign: "center",
                      color: txt,
                      padding: "0 4px",
                      overflow: "hidden",
                    }}
                  >
                    <div style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.1 }}>
                      {str(stage?.label)}
                    </div>
                    {stage?.description && (
                      <div style={{ fontSize: 12, opacity: 0.9, marginTop: 4, lineHeight: 1.2 }}>
                        {str(stage.description)}
                      </div>
                    )}
                  </div>
                </foreignObject>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

// ── 2. Concentric circles ────────────────────────────────────────────────
export function ConcentricCirclesDiagram({ content, theme }: any) {
  const title = str(content?.title);
  const layers = arr(content?.layers).slice(0, 5);
  const n = layers.length || 1;
  const W = 1000, H = 520;
  const cx = 380, cy = H / 2;
  const rMax = 230;
  return (
    <div className="absolute inset-0 flex flex-col p-10">
      <TitleRow title={title} theme={theme} />
      <div className="flex-1 min-h-0 flex">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full">
          {layers.map((lv: any, i: number) => {
            const r = rMax - (i * rMax) / n;
            const op = 0.25 + (i / Math.max(n - 1, 1)) * 0.65;
            return <circle key={i} cx={cx} cy={cy} r={r} fill={theme.accent} opacity={op} />;
          })}
          {/* Labels on the right */}
          {layers.map((lv: any, i: number) => {
            const y = 60 + i * ((H - 120) / Math.max(n - 1, 1));
            return (
              <g key={`l-${i}`} transform={`translate(680, ${y})`}>
                <circle cx={0} cy={0} r={8} fill={theme.accent} opacity={0.4 + (i / Math.max(n - 1, 1)) * 0.6} />
                <text x={22} y={6} fontSize={20} fontWeight={700} fill={theme.heading}>
                  {str(lv?.label)}
                </text>
                {lv?.description && (
                  <text x={22} y={28} fontSize={13} fill={theme.muted}>
                    {str(lv.description)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

// ── 3. Venn (2-set) ──────────────────────────────────────────────────────
export function VennDiagram({ content, theme }: any) {
  const title = str(content?.title);
  const a = content?.set_a || {};
  const b = content?.set_b || {};
  const overlap = str(content?.overlap_label);
  const W = 1000, H = 520;
  const r = 200;
  const cxA = 380, cxB = 620, cy = H / 2;
  return (
    <div className="absolute inset-0 flex flex-col p-10">
      <TitleRow title={title} theme={theme} />
      <div className="flex-1 min-h-0">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full">
          <circle cx={cxA} cy={cy} r={r} fill={theme.accent} opacity={0.45} />
          <circle cx={cxB} cy={cy} r={r} fill={theme.accent} opacity={0.45} />
          <text x={cxA - 110} y={70} fontSize={22} fontWeight={800} fill={theme.heading}>
            {str(a?.label)}
          </text>
          <text x={cxB - 100} y={70} fontSize={22} fontWeight={800} fill={theme.heading}>
            {str(b?.label)}
          </text>
          {/* Item lists left/right */}
          {arr(a?.items).slice(0, 4).map((it: any, i: number) => (
            <text key={`a${i}`} x={cxA - 170} y={cy - 30 + i * 22} fontSize={14} fill={theme.bg} fontWeight={600}>
              • {str(it)}
            </text>
          ))}
          {arr(b?.items).slice(0, 4).map((it: any, i: number) => (
            <text key={`b${i}`} x={cxB + 30} y={cy - 30 + i * 22} fontSize={14} fill={theme.bg} fontWeight={600}>
              • {str(it)}
            </text>
          ))}
          {/* Overlap label */}
          {overlap && (
            <text x={(cxA + cxB) / 2} y={cy - 4} textAnchor="middle" fontSize={18} fontWeight={800} fill={theme.bg}>
              {overlap}
            </text>
          )}
          {arr(content?.overlap_items).slice(0, 3).map((it: any, i: number) => (
            <text
              key={`o${i}`}
              x={(cxA + cxB) / 2}
              y={cy + 22 + i * 20}
              textAnchor="middle"
              fontSize={13}
              fill={theme.bg}
            >
              • {str(it)}
            </text>
          ))}
        </svg>
      </div>
    </div>
  );
}

// ── 4. Target / bullseye ─────────────────────────────────────────────────
export function TargetDiagram({ content, theme }: any) {
  const title = str(content?.title);
  const rings = arr(content?.rings).slice(0, 5);
  const n = rings.length || 1;
  const W = 1000, H = 520;
  const cx = 320, cy = H / 2;
  const rMax = 220;
  return (
    <div className="absolute inset-0 flex flex-col p-10">
      <TitleRow title={title} theme={theme} />
      <div className="flex-1 min-h-0">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full">
          {rings.map((_: any, i: number) => {
            const r = rMax * (1 - i / n);
            const op = 0.3 + (i / Math.max(n - 1, 1)) * 0.6;
            return (
              <circle
                key={i}
                cx={cx}
                cy={cy}
                r={r}
                fill={theme.accent}
                opacity={op}
                stroke={theme.bg}
                strokeWidth={2}
              />
            );
          })}
          {/* Crosshairs */}
          <line x1={cx - rMax - 20} x2={cx + rMax + 20} y1={cy} y2={cy} stroke={theme.muted} strokeWidth={1} opacity={0.4} />
          <line y1={cy - rMax - 20} y2={cy + rMax + 20} x1={cx} x2={cx} stroke={theme.muted} strokeWidth={1} opacity={0.4} />
          {/* Labels right column */}
          {rings.map((ring: any, i: number) => {
            const y = 60 + i * ((H - 120) / Math.max(n - 1, 1));
            return (
              <g key={`lbl-${i}`} transform={`translate(620, ${y})`}>
                <circle cx={0} cy={0} r={6} fill={theme.accent} opacity={0.4 + (i / Math.max(n - 1, 1)) * 0.6} />
                <text x={18} y={5} fontSize={18} fontWeight={700} fill={theme.heading}>
                  {str(ring?.label)}
                </text>
                {ring?.description && (
                  <text x={18} y={26} fontSize={13} fill={theme.muted}>
                    {str(ring.description)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

// ── 5. Connected circles (horizontal flow) ───────────────────────────────
export function ConnectedCirclesDiagram({ content, theme }: any) {
  const title = str(content?.title);
  const nodes = arr(content?.nodes).slice(0, 5);
  const n = nodes.length || 1;
  const W = 1000, H = 460;
  const margin = 80;
  const r = 70;
  const span = (W - margin * 2) / Math.max(n - 1, 1);
  const cy = 180;
  return (
    <div className="absolute inset-0 flex flex-col p-10">
      <TitleRow title={title} theme={theme} />
      <div className="flex-1 min-h-0">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full">
          {/* connector line */}
          {n > 1 && (
            <line
              x1={margin}
              x2={W - margin}
              y1={cy}
              y2={cy}
              stroke={theme.accent}
              strokeWidth={4}
              opacity={0.4}
            />
          )}
          {nodes.map((node: any, i: number) => {
            const cx = margin + i * span;
            const op = 0.5 + (i / Math.max(n - 1, 1)) * 0.5;
            return (
              <g key={i}>
                <circle cx={cx} cy={cy} r={r} fill={theme.accent} opacity={op} />
                {wrapText(str(node?.label), 14).map((ln, k, all) => (
                  <text
                    key={k}
                    x={cx}
                    y={cy + (k - (all.length - 1) / 2) * 18}
                    textAnchor="middle"
                    fontSize={16}
                    fontWeight={800}
                    fill={theme.bg}
                  >
                    {ln}
                  </text>
                ))}
                {node?.description && (
                  <foreignObject x={cx - 90} y={cy + r + 12} width={180} height={120}>
                    <div
                      style={{
                        color: theme.text,
                        fontSize: 13,
                        textAlign: "center",
                        lineHeight: 1.3,
                      }}
                    >
                      {str(node.description)}
                    </div>
                  </foreignObject>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
