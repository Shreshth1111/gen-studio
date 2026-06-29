"use client";
import React from "react";

/**
 * Smart-chart renderers — pure SVG, no library.
 *
 * Shared schema (so the LLM picks one shape to populate):
 *   bar_chart / line_chart / area_chart:
 *     { title, subtitle?, x_label?, y_label?,
 *       categories: ["Q1", "Q2", ...],
 *       series: [{ name: "Revenue", data: [1, 2, 3, ...], color? }, ...] }
 *
 *   pie_chart / donut_chart:
 *     { title, subtitle?, slices: [{ label, value, color? }, ...] }
 *
 * If multiple series share categories, they're drawn grouped (bar) or
 * stacked-line (line/area). Categorical x-axis only — keeps it readable
 * inside a slide.
 */

// ── Shared helpers ────────────────────────────────────────────────────────
function str(v: any, fb = ""): string {
  if (v === null || v === undefined) return fb;
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return fb;
}
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
function num(v: any, fb = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fb;
}
/** Series data should be an array of numbers. Some older slides (or a stray
 *  LLM response) stored it as a comma-joined string like "12, 8, 20, 64" —
 *  recover those so the chart still draws instead of flat-lining at zero. */
function numArr(v: any): number[] {
  if (Array.isArray(v)) return v.map((x) => num(x));
  if (typeof v === "string" && v.trim()) {
    return v.split(/[,\s]+/).filter(Boolean).map((x) => num(x));
  }
  return [];
}

/** Hardcoded series-color palette that reads well over every theme bg. */
function seriesPalette(theme: any): string[] {
  return [
    theme.accent,
    "#10B981", // emerald
    "#F59E0B", // amber
    "#8B5CF6", // violet
    "#EC4899", // pink
    "#06B6D4", // cyan
  ];
}

function Title({ title, subtitle, theme }: any) {
  if (!title && !subtitle) return null;
  return (
    <div className="mb-3 flex-shrink-0">
      {title && (
        <h2 className="text-3xl font-bold leading-tight" style={{ color: theme.heading }}>
          {title}
        </h2>
      )}
      {subtitle && (
        <p className="text-sm mt-1" style={{ color: theme.muted }}>
          {subtitle}
        </p>
      )}
      <div className="mt-2 h-1 w-12 rounded-full" style={{ backgroundColor: theme.accent }} />
    </div>
  );
}

function Legend({ series, theme, palette }: any) {
  if (!series || series.length <= 1) return null;
  return (
    <div className="flex gap-4 mt-2 flex-wrap">
      {series.map((s: any, i: number) => (
        <div key={i} className="flex items-center gap-1.5 text-xs" style={{ color: theme.text }}>
          <span
            className="w-3 h-3 rounded"
            style={{ backgroundColor: s?.color || palette[i % palette.length] }}
          />
          {str(s?.name) || `Series ${i + 1}`}
        </div>
      ))}
    </div>
  );
}

/** Returns nice round axis ticks given a max value. */
function niceTicks(maxVal: number): { ticks: number[]; max: number } {
  if (maxVal <= 0) return { ticks: [0, 1, 2, 3, 4], max: 4 };
  const rough = maxVal / 4;
  const pow = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / pow;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * pow;
  const max = Math.ceil(maxVal / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= max + 1e-9; v += step) ticks.push(v);
  return { ticks, max };
}

function fmt(v: number): string {
  if (Math.abs(v) >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(1)}k`;
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(1);
}

// ── 1. Bar chart ──────────────────────────────────────────────────────────
export function BarChart({ content, theme }: any) {
  const title = str(content?.title);
  const subtitle = str(content?.subtitle);
  const categories = arr(content?.categories).map((c) => str(c));
  const series = arr(content?.series);
  const palette = seriesPalette(theme);

  const W = 1000, H = 460;
  const M = { l: 60, r: 30, t: 20, b: 56 };
  const innerW = W - M.l - M.r;
  const innerH = H - M.t - M.b;

  const allVals = series.flatMap((s: any) => numArr(s?.data));
  const { ticks, max } = niceTicks(Math.max(...allVals, 1));
  const yToPx = (v: number) => M.t + innerH - (v / max) * innerH;

  const nCat = Math.max(categories.length, 1);
  const nSer = Math.max(series.length, 1);
  const groupW = innerW / nCat;
  const barW = (groupW * 0.7) / nSer;
  const groupPad = (groupW - barW * nSer) / 2;

  return (
    <div className="absolute inset-0 flex flex-col p-10">
      <Title title={title} subtitle={subtitle} theme={theme} />
      <div className="flex-1 min-h-0">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full">
          {/* gridlines + Y ticks */}
          {ticks.map((t, i) => (
            <g key={i}>
              <line x1={M.l} x2={W - M.r} y1={yToPx(t)} y2={yToPx(t)}
                    stroke={theme.border} strokeWidth={1} opacity={0.5} />
              <text x={M.l - 8} y={yToPx(t) + 4} textAnchor="end" fontSize={12} fill={theme.muted}>
                {fmt(t)}
              </text>
            </g>
          ))}
          {/* bars */}
          {categories.map((cat, ci) => {
            const x0 = M.l + ci * groupW + groupPad;
            return (
              <g key={ci}>
                {series.map((s: any, si: number) => {
                  const val = numArr(s?.data)[ci] ?? 0;
                  const h = (val / max) * innerH;
                  const x = x0 + si * barW;
                  return (
                    <rect
                      key={si}
                      x={x}
                      y={M.t + innerH - h}
                      width={barW - 4}
                      height={h}
                      rx={3}
                      fill={s?.color || palette[si % palette.length]}
                    />
                  );
                })}
                <text
                  x={M.l + ci * groupW + groupW / 2}
                  y={H - M.b + 18}
                  textAnchor="middle"
                  fontSize={12}
                  fill={theme.text}
                >
                  {cat}
                </text>
              </g>
            );
          })}
          {/* axes */}
          <line x1={M.l} x2={W - M.r} y1={M.t + innerH} y2={M.t + innerH} stroke={theme.border} strokeWidth={1.5} />
          <line x1={M.l} x2={M.l} y1={M.t} y2={M.t + innerH} stroke={theme.border} strokeWidth={1.5} />
        </svg>
      </div>
      <Legend series={series} theme={theme} palette={palette} />
    </div>
  );
}

// ── 2. Line chart ─────────────────────────────────────────────────────────
export function LineChart({ content, theme }: any) {
  return <_LineLikeChart content={content} theme={theme} mode="line" />;
}

// ── 3. Area chart ─────────────────────────────────────────────────────────
export function AreaChart({ content, theme }: any) {
  return <_LineLikeChart content={content} theme={theme} mode="area" />;
}

function _LineLikeChart({ content, theme, mode }: any) {
  const title = str(content?.title);
  const subtitle = str(content?.subtitle);
  const categories = arr(content?.categories).map((c) => str(c));
  const series = arr(content?.series);
  const palette = seriesPalette(theme);

  const W = 1000, H = 460;
  const M = { l: 60, r: 30, t: 20, b: 56 };
  const innerW = W - M.l - M.r;
  const innerH = H - M.t - M.b;

  const allVals = series.flatMap((s: any) => numArr(s?.data));
  const { ticks, max } = niceTicks(Math.max(...allVals, 1));
  const yToPx = (v: number) => M.t + innerH - (v / max) * innerH;

  const nCat = Math.max(categories.length, 1);
  const xToPx = (i: number) =>
    nCat === 1 ? M.l + innerW / 2 : M.l + (i * innerW) / (nCat - 1);

  return (
    <div className="absolute inset-0 flex flex-col p-10">
      <Title title={title} subtitle={subtitle} theme={theme} />
      <div className="flex-1 min-h-0">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full">
          {ticks.map((t, i) => (
            <g key={i}>
              <line x1={M.l} x2={W - M.r} y1={yToPx(t)} y2={yToPx(t)}
                    stroke={theme.border} strokeWidth={1} opacity={0.5} />
              <text x={M.l - 8} y={yToPx(t) + 4} textAnchor="end" fontSize={12} fill={theme.muted}>
                {fmt(t)}
              </text>
            </g>
          ))}
          {/* category labels */}
          {categories.map((cat, i) => (
            <text key={i} x={xToPx(i)} y={H - M.b + 18} textAnchor="middle" fontSize={12} fill={theme.text}>
              {cat}
            </text>
          ))}
          {/* series */}
          {series.map((s: any, si: number) => {
            const color = s?.color || palette[si % palette.length];
            const pts = numArr(s?.data).map((v: number, i: number) => [xToPx(i), yToPx(v)]);
            const path = pts.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(" ");
            if (mode === "area" && pts.length) {
              const areaPath = `${path} L${pts[pts.length - 1][0]},${M.t + innerH} L${pts[0][0]},${M.t + innerH} Z`;
              return (
                <g key={si}>
                  <path d={areaPath} fill={color} opacity={0.25} />
                  <path d={path} stroke={color} strokeWidth={3} fill="none" />
                  {pts.map((p, i) => (
                    <circle key={i} cx={p[0]} cy={p[1]} r={4} fill={color} />
                  ))}
                </g>
              );
            }
            return (
              <g key={si}>
                <path d={path} stroke={color} strokeWidth={3} fill="none" />
                {pts.map((p, i) => (
                  <circle key={i} cx={p[0]} cy={p[1]} r={4} fill={color} />
                ))}
              </g>
            );
          })}
          <line x1={M.l} x2={W - M.r} y1={M.t + innerH} y2={M.t + innerH} stroke={theme.border} strokeWidth={1.5} />
          <line x1={M.l} x2={M.l} y1={M.t} y2={M.t + innerH} stroke={theme.border} strokeWidth={1.5} />
        </svg>
      </div>
      <Legend series={series} theme={theme} palette={palette} />
    </div>
  );
}

// ── 4. Pie chart ──────────────────────────────────────────────────────────
export function PieChart({ content, theme }: any) {
  return <_PieLikeChart content={content} theme={theme} mode="pie" />;
}

// ── 5. Donut chart ────────────────────────────────────────────────────────
export function DonutChart({ content, theme }: any) {
  return <_PieLikeChart content={content} theme={theme} mode="donut" />;
}

function _PieLikeChart({ content, theme, mode }: any) {
  const title = str(content?.title);
  const subtitle = str(content?.subtitle);
  const slices = arr(content?.slices);
  const palette = seriesPalette(theme);
  const total = slices.reduce((acc: number, s: any) => acc + num(s?.value), 0) || 1;

  const W = 1000, H = 460;
  const cx = 320, cy = H / 2 - 10, R = 180, r = mode === "donut" ? 100 : 0;
  let angle = -Math.PI / 2;

  const arcPath = (a0: number, a1: number) => {
    const x0 = cx + R * Math.cos(a0);
    const y0 = cy + R * Math.sin(a0);
    const x1 = cx + R * Math.cos(a1);
    const y1 = cy + R * Math.sin(a1);
    const large = a1 - a0 > Math.PI ? 1 : 0;
    if (mode === "donut") {
      const xi0 = cx + r * Math.cos(a0);
      const yi0 = cy + r * Math.sin(a0);
      const xi1 = cx + r * Math.cos(a1);
      const yi1 = cy + r * Math.sin(a1);
      return `M${x0},${y0} A${R},${R} 0 ${large} 1 ${x1},${y1} L${xi1},${yi1} A${r},${r} 0 ${large} 0 ${xi0},${yi0} Z`;
    }
    return `M${cx},${cy} L${x0},${y0} A${R},${R} 0 ${large} 1 ${x1},${y1} Z`;
  };

  return (
    <div className="absolute inset-0 flex flex-col p-10">
      <Title title={title} subtitle={subtitle} theme={theme} />
      <div className="flex-1 min-h-0">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full">
          {slices.map((s: any, i: number) => {
            const v = num(s?.value);
            const a0 = angle;
            const a1 = angle + (v / total) * Math.PI * 2;
            angle = a1;
            const color = s?.color || palette[i % palette.length];
            return <path key={i} d={arcPath(a0, a1)} fill={color} stroke={theme.bg} strokeWidth={2} />;
          })}
          {mode === "donut" && (
            <text x={cx} y={cy + 8} textAnchor="middle" fontSize={28} fontWeight={800} fill={theme.heading}>
              {fmt(total)}
            </text>
          )}
          {/* Legend on the right */}
          {slices.map((s: any, i: number) => {
            const v = num(s?.value);
            const pct = ((v / total) * 100).toFixed(0);
            const color = s?.color || palette[i % palette.length];
            const yy = 30 + i * 36;
            return (
              <g key={`l-${i}`} transform={`translate(620, ${yy})`}>
                <rect x={0} y={0} width={20} height={20} rx={4} fill={color} />
                <text x={32} y={15} fontSize={16} fontWeight={600} fill={theme.heading}>
                  {str(s?.label)}
                </text>
                <text x={32} y={32} fontSize={13} fill={theme.muted}>
                  {fmt(v)} ({pct}%)
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
