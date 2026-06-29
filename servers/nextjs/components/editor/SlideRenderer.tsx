"use client";
import React, { useEffect, useState } from "react";
import { Plus, X, ArrowRight } from "lucide-react";
import {
  FunnelDiagram, ConcentricCirclesDiagram, VennDiagram,
  TargetDiagram, ConnectedCirclesDiagram,
} from "./SmartDiagrams";
import {
  BarChart, LineChart, AreaChart, PieChart, DonutChart,
} from "./SmartCharts";
import RichText from "./RichText";
import OverlayLayer from "./OverlayLayer";

interface SlideRendererProps {
  slide: any;
  theme: Record<string, string>;
  onUpdate?: (patch: any) => void;
  editable?: boolean;
}

// Safe string extractor - never returns an object
function str(val: any, fallback = ""): string {
  if (val === null || val === undefined) return fallback;
  if (typeof val === "string") return val;
  if (typeof val === "number") return String(val);
  if (Array.isArray(val)) return val.map(v => str(v)).join(", ");
  if (typeof val === "object") {
    if (val.bullets || val.title || val.quote) return fallback;
    return JSON.stringify(val);
  }
  return String(val);
}

function arr(val: any): any[] {
  if (Array.isArray(val)) return val;
  if (typeof val === "string") return val.split("\n").filter(l => l.trim());
  return [];
}

/**
 * Thin wrapper over RichText that preserves the EditableText API every
 * existing layout depends on. By default every text field in the slide is
 * now rich (B/I/U/S/link/lists/align/color via floating toolbar). Atomic
 * fields that should stay plain — e.g. a year, the value of a stat, a
 * numbered step — can opt out with `rich={false}` at the call site if ever
 * needed; otherwise they just won't surface formatted output.
 *
 * Storage: HTML string. Plain-text values flow through unchanged thanks to
 * `isPlainText` handling inside RichText.
 */
function EditableText({
  value, onChange, editable, className, style, tag: Tag = "div", placeholder = "Click to edit...",
  rich = true, themeColors = [],
}: {
  value: string;
  onChange?: (v: string) => void;
  editable?: boolean;
  className?: string;
  style?: React.CSSProperties;
  tag?: any;
  placeholder?: string;
  rich?: boolean;
  themeColors?: string[];
}) {
  return (
    <RichText
      value={typeof value === "string" ? value : str(value)}
      onChange={onChange}
      editable={editable}
      className={className}
      style={style}
      placeholder={placeholder}
      rich={rich}
      tag={Tag}
      themeColors={themeColors}
    />
  );
}

function SlideHeader({
  title, theme, editable, onUpdate, content, eyebrow,
}: {
  title: string; theme: Record<string, string>;
  editable?: boolean; onUpdate?: (patch: any) => void;
  content: any; eyebrow?: string;
}) {
  return (
    <div className="mb-4 flex-shrink-0">
      {eyebrow && (
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] mb-1.5"
           style={{ color: theme.accent }}>{eyebrow}</p>
      )}
      <EditableText
        value={title}
        editable={editable}
        onChange={v => onUpdate?.({ content: { ...content, title: v } })}
        tag="h2"
        className="text-3xl font-bold leading-tight"
        style={{ color: theme.heading }}
        placeholder="Slide Title"
      />
      <div className="mt-2 h-1 w-12 rounded-full" style={{ backgroundColor: theme.accent }} />
    </div>
  );
}

// ── Layout Renderers ──────────────────────────────────────────────────────

function TitleLayout({ content, theme, editable, onUpdate }: any) {
  const title = str(content?.title);
  const subtitle = str(content?.subtitle);
  return (
    <div className="absolute inset-0 flex">
      <div className="w-2 h-full flex-shrink-0" style={{ backgroundColor: theme.accent }} />
      <div className="flex-1 flex flex-col items-center justify-center px-16 text-center">
        <EditableText
          value={title}
          editable={editable}
          onChange={v => onUpdate?.({ content: { ...content, title: v } })}
          tag="h1"
          className="text-6xl font-black leading-tight tracking-tight mb-5"
          style={{ color: theme.heading }}
          placeholder="Presentation Title"
        />
        <EditableText
          value={subtitle}
          editable={editable}
          onChange={v => onUpdate?.({ content: { ...content, subtitle: v } })}
          className="text-xl"
          style={{ color: theme.muted }}
          placeholder="Subtitle or tagline"
        />
        <div className="mt-10 h-1.5 w-20 rounded-full" style={{ backgroundColor: theme.accent }} />
      </div>
    </div>
  );
}

function SectionHeaderLayout({ content, theme, editable, onUpdate }: any) {
  const title = str(content?.title);
  const subtitle = str(content?.subtitle);
  const eyebrow = str(content?.eyebrow);
  return (
    <div className="absolute inset-0 flex">
      <div className="w-3 h-full flex-shrink-0" style={{ backgroundColor: theme.accent }} />
      <div className="flex-1 flex flex-col justify-center px-16">
        {eyebrow && (
          <p className="text-sm font-bold uppercase tracking-[0.3em] mb-4"
             style={{ color: theme.accent }}>
            {eyebrow}
          </p>
        )}
        <EditableText
          value={title}
          editable={editable}
          onChange={v => onUpdate?.({ content: { ...content, title: v } })}
          tag="h1"
          className="text-7xl font-black leading-tight tracking-tight"
          style={{ color: theme.heading }}
          placeholder="Section Title"
        />
        <div className="mt-6 h-1.5 w-20 rounded-full" style={{ backgroundColor: theme.accent }} />
        {subtitle && (
          <p className="text-xl mt-6 max-w-3xl" style={{ color: theme.muted }}>{subtitle}</p>
        )}
      </div>
    </div>
  );
}

function EditableBulletList({
  bullets, theme, editable, bulletKey, content, onUpdate, max,
}: {
  bullets: any[];
  theme: Record<string, string>;
  editable?: boolean;
  bulletKey: string;
  content: any;
  onUpdate?: (patch: any) => void;
  max?: number;
}) {
  const setBullets = (next: string[]) =>
    onUpdate?.({ content: { ...content, [bulletKey]: next } });
  const visible = max ? bullets.slice(0, max) : bullets;
  return (
    <ul className="space-y-2.5">
      {visible.map((b, i) => (
        <li key={i} className="flex items-start gap-3 group/bullet">
          <span
            className="mt-2 w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: theme.accent }}
          />
          <EditableText
            value={str(b)}
            editable={editable}
            onChange={(v) => {
              const next = [...bullets.map((x: any) => str(x))];
              next[i] = v;
              setBullets(next);
            }}
            className="text-base leading-relaxed flex-1 min-w-0"
            style={{ color: theme.text }}
            placeholder="Add a point…"
          />
          {editable && (
            <button
              onClick={() => {
                const next = [...bullets.map((x: any) => str(x))];
                next.splice(i, 1);
                setBullets(next);
              }}
              className="opacity-0 group-hover/bullet:opacity-100 mt-1.5 w-4 h-4 rounded-full flex items-center justify-center text-slate-500 hover:bg-red-500/20 hover:text-red-400 transition-all"
              title="Remove bullet"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </li>
      ))}
      {editable && (!max || bullets.length < max) && (
        <li>
          <button
            onClick={() => setBullets([...bullets.map((x: any) => str(x)), "New point"])}
            className="flex items-center gap-2 text-sm opacity-50 hover:opacity-100 transition-opacity"
            style={{ color: theme.accent }}
          >
            <Plus className="w-4 h-4" /> Add bullet
          </button>
        </li>
      )}
    </ul>
  );
}

/** Edit one field of an item inside a list (e.g. content.items[2].heading).
 *  Returns a **slide patch** ({content: {...}}) ready to hand to onUpdate.
 *  IMPORTANT: the wrapper is what makes the edit reach `slide.content` in
 *  Redux and the `content` field on the API request — without it, the diff
 *  lands on top-level slide fields and silently disappears on the next read. */
function patchListField(content: any, listKey: string, index: number,
                       field: string, value: string) {
  const list = Array.isArray(content?.[listKey]) ? [...content[listKey]] : [];
  const cur = typeof list[index] === "object" && list[index] !== null
    ? { ...list[index] } : {};
  cur[field] = value;
  list[index] = cur;
  return { content: { ...content, [listKey]: list } };
}

function removeListItem(content: any, listKey: string, index: number) {
  const list = Array.isArray(content?.[listKey]) ? [...content[listKey]] : [];
  list.splice(index, 1);
  return { content: { ...content, [listKey]: list } };
}

function appendListItem(content: any, listKey: string, blank: any) {
  const list = Array.isArray(content?.[listKey]) ? [...content[listKey]] : [];
  list.push(blank);
  return { content: { ...content, [listKey]: list } };
}

/** Renders a [+ Add] button. */
function AddItemButton({ theme, onClick, label = "Add item" }: any) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 text-xs opacity-60 hover:opacity-100 transition-opacity"
      style={{ color: theme.accent }}
    >
      <Plus className="w-3.5 h-3.5" /> {label}
    </button>
  );
}

/** Renders the small [×] remove affordance — meant to overlay an item. */
function RemoveItemButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center bg-black/40 text-white/70 opacity-0 group-hover/item:opacity-100 hover:bg-red-500/80 hover:text-white transition-all z-10"
      title="Remove"
    >
      <X className="w-3 h-3" />
    </button>
  );
}

function BulletsLayout({ content, theme, editable, onUpdate }: any) {
  const title = str(content?.title);
  const bullets = arr(content?.bullets);
  const callout = str(content?.callout);
  const hasImage = !!str(content?.image_url);
  return (
    <div className="absolute inset-0 flex gap-8 p-10">
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <SlideHeader title={title} theme={theme} editable={editable} onUpdate={onUpdate} content={content} />
        <div className="flex-1 overflow-hidden">
          <EditableBulletList
            bullets={bullets}
            theme={theme}
            editable={editable}
            bulletKey="bullets"
            content={content}
            onUpdate={onUpdate}
            max={7}
          />
        </div>
        {callout && (
          <div className="mt-3 p-3 rounded-xl border-l-4 flex-shrink-0"
               style={{ borderLeftColor: theme.accent, color: theme.heading, backgroundColor: theme.secondary }}>
            <p className="text-sm font-medium">{callout}</p>
          </div>
        )}
      </div>
      {hasImage && (
        <div className="w-2/5 flex-shrink-0 rounded-2xl overflow-hidden shadow-lg self-center"
             style={{ backgroundColor: theme.secondary, maxHeight: "85%" }}>
          <img src={str(content.image_url)} alt="" className="w-full h-full object-cover" />
        </div>
      )}
    </div>
  );
}

function TwoColumnLayout({ content, theme, editable, onUpdate }: any) {
  const title = str(content?.title);
  return (
    <div className="absolute inset-0 flex flex-col p-10">
      <SlideHeader title={title} theme={theme} editable={editable} onUpdate={onUpdate} content={content} />
      <div className="flex flex-1 gap-5 min-h-0 overflow-hidden">
        {(["col1", "col2"] as const).map(col => (
          <div key={col} className="flex-1 rounded-2xl p-5 flex flex-col overflow-hidden"
               style={{ backgroundColor: theme.secondary, border: `1px solid ${theme.border}` }}>
            <EditableText
              value={str(content?.[`${col}_heading`])}
              editable={editable}
              onChange={(v) =>
                onUpdate?.({ content: { ...content, [`${col}_heading`]: v } })
              }
              tag="h3"
              className="font-bold text-lg mb-3 flex-shrink-0"
              style={{ color: theme.accent }}
              placeholder="Heading"
            />
            <div className="flex-1 min-h-0 overflow-hidden">
              <EditableBulletList
                bullets={arr(content?.[`${col}_bullets`])}
                theme={theme}
                editable={editable}
                bulletKey={`${col}_bullets`}
                content={content}
                onUpdate={onUpdate}
                max={6}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// NEW — 3-4 columns each with an arrow icon + heading + body text.
function ArrowColumnsLayout({ content, theme, editable, onUpdate }: any) {
  const title = str(content?.title);
  const items = arr(content?.items).slice(0, 4);
  return (
    <div className="absolute inset-0 flex flex-col p-10">
      <SlideHeader title={title} theme={theme} editable={editable} onUpdate={onUpdate} content={content} />
      <div className="flex flex-1 gap-6 min-h-0 mt-2">
        {items.map((item: any, i: number) => (
          <div key={i} className="relative flex-1 flex flex-col min-w-0 group/item">
            {editable && (
              <RemoveItemButton onClick={() => onUpdate?.(removeListItem(content, "items", i))} />
            )}
            <ArrowRight className="w-7 h-7 mb-3 flex-shrink-0" style={{ color: theme.accent }} strokeWidth={2.5} />
            <EditableText
              value={str(item?.heading)}
              editable={editable}
              onChange={v => onUpdate?.(patchListField(content, "items", i, "heading", v))}
              tag="h3"
              className="text-xl font-bold leading-tight mb-2"
              style={{ color: theme.heading }}
              placeholder="Heading"
            />
            <EditableText
              value={str(item?.description)}
              editable={editable}
              onChange={v => onUpdate?.(patchListField(content, "items", i, "description", v))}
              tag="p"
              className="text-sm leading-relaxed"
              style={{ color: theme.text }}
              placeholder="Describe this point…"
            />
          </div>
        ))}
        {editable && items.length < 4 && (
          <div className="flex items-start pt-10">
            <AddItemButton
              theme={theme}
              label="Add column"
              onClick={() => onUpdate?.(appendListItem(content, "items",
                { heading: "New heading", description: "Describe this point." }))}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function ImageSideLayout({ content, theme, editable, onUpdate, imageLeft }: any) {
  const title = str(content?.title);
  const contentHeading = str(content?.content_heading);
  const bullets = arr(content?.bullets).slice(0, 6);
  const imageUrl = str(content?.image_url);

  const textSide = (
    <div className="flex-1 flex flex-col justify-center min-w-0 overflow-hidden">
      <SlideHeader title={title} theme={theme} editable={editable} onUpdate={onUpdate} content={content} />
      {contentHeading && (
        <p className="text-lg font-semibold mb-3" style={{ color: theme.accent }}>{contentHeading}</p>
      )}
      <ul className="space-y-2">
        {bullets.map((b: any, i: number) => (
          <li key={i} className="flex items-start gap-3">
            <span className="mt-2 w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: theme.accent }} />
            <span className="leading-relaxed text-base" style={{ color: theme.text }}>{str(b)}</span>
          </li>
        ))}
      </ul>
    </div>
  );

  const imgSide = (
    <div className="w-2/5 flex-shrink-0 rounded-2xl overflow-hidden shadow-lg self-center"
         style={{ backgroundColor: theme.secondary, maxHeight: "90%", aspectRatio: "4/5" }}>
      {imageUrl
        ? <img src={imageUrl} alt="" className="w-full h-full object-cover" />
        : <div className="w-full h-full flex items-center justify-center opacity-30 text-5xl">🖼️</div>
      }
    </div>
  );

  return (
    <div className="absolute inset-0 flex gap-8 p-10">
      {imageLeft ? <>{imgSide}{textSide}</> : <>{textSide}{imgSide}</>}
    </div>
  );
}

// NEW — Image on the left + eyebrow + title + 2-4 dark cards on the right.
function ImageWithCardsLayout({ content, theme, editable, onUpdate }: any) {
  const title = str(content?.title);
  const eyebrow = str(content?.eyebrow);
  const imageUrl = str(content?.image_url);
  const cards = arr(content?.cards).slice(0, 4);
  return (
    <div className="absolute inset-0 flex">
      <div className="w-1/2 h-full flex-shrink-0 overflow-hidden"
           style={{ backgroundColor: theme.secondary }}>
        {imageUrl
          ? <img src={imageUrl} alt="" className="w-full h-full object-cover" />
          : <div className="w-full h-full flex items-center justify-center opacity-30 text-5xl">🖼️</div>}
      </div>
      <div className="flex-1 flex flex-col p-8 overflow-hidden min-w-0">
        <EditableText
          value={eyebrow}
          editable={editable}
          onChange={v => onUpdate?.({ content: { ...content, eyebrow: v } })}
          tag="div"
          className="inline-block self-start text-[11px] font-bold uppercase tracking-[0.2em] px-3 py-1 rounded-md mb-3"
          style={{ border: `1px solid ${theme.accent}`, color: theme.accent }}
          placeholder="EYEBROW TAG"
        />
        <EditableText
          value={title}
          editable={editable}
          onChange={v => onUpdate?.({ content: { ...content, title: v } })}
          tag="h2"
          className="text-4xl font-black leading-tight mb-5 flex-shrink-0"
          style={{ color: theme.heading }}
          placeholder="Slide Title"
        />
        <div className="grid grid-cols-2 gap-3 flex-1 min-h-0">
          {cards.map((c: any, i: number) => {
            const isLast = i === cards.length - 1 && cards.length % 2 === 1;
            return (
              <div key={i}
                   className={`relative rounded-xl p-4 flex flex-col overflow-hidden group/item ${isLast ? "col-span-2" : ""}`}
                   style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}>
                {editable && (
                  <RemoveItemButton onClick={() => onUpdate?.(removeListItem(content, "cards", i))} />
                )}
                <EditableText
                  value={str(c?.heading)}
                  editable={editable}
                  onChange={v => onUpdate?.(patchListField(content, "cards", i, "heading", v))}
                  tag="h3"
                  className="text-base font-bold mb-1.5"
                  style={{ color: theme.heading }}
                  placeholder="Heading"
                />
                <EditableText
                  value={str(c?.description)}
                  editable={editable}
                  onChange={v => onUpdate?.(patchListField(content, "cards", i, "description", v))}
                  tag="p"
                  className="text-xs leading-snug flex-1"
                  style={{ color: theme.text }}
                  placeholder="Describe…"
                />
              </div>
            );
          })}
          {editable && cards.length < 4 && (
            <div className="col-span-2 mt-1">
              <AddItemButton
                theme={theme}
                label="Add card"
                onClick={() => onUpdate?.(appendListItem(content, "cards",
                  { heading: "New heading", description: "Describe this card." }))}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatsLayout({ content, theme, editable, onUpdate }: any) {
  const title = str(content?.title);
  const subtitle = str(content?.subtitle);
  const stats = arr(content?.stats).slice(0, 4);
  return (
    <div className="absolute inset-0 flex flex-col p-10">
      <EditableText
        value={title}
        editable={editable}
        onChange={v => onUpdate?.({ content: { ...content, title: v } })}
        tag="h2"
        className="text-3xl font-bold leading-tight"
        style={{ color: theme.heading }}
        placeholder="Stats Title"
      />
      <EditableText
        value={subtitle}
        editable={editable}
        onChange={v => onUpdate?.({ content: { ...content, subtitle: v } })}
        tag="p"
        className="text-base mt-1"
        style={{ color: theme.muted }}
        placeholder="Optional subtitle"
      />
      <div className="mt-2 h-1 w-12 rounded-full" style={{ backgroundColor: theme.accent }} />
      <div className="flex-1 grid gap-4 mt-6 min-h-0" style={{ gridTemplateColumns: `repeat(${Math.min(Math.max(stats.length, 1), 4)}, 1fr)` }}>
        {stats.map((stat: any, i: number) => (
          <div key={i}
               className="relative flex flex-col items-center justify-center rounded-2xl p-4 overflow-hidden group/item"
               style={{ backgroundColor: theme.secondary, border: `1px solid ${theme.border}` }}>
            {editable && (
              <RemoveItemButton onClick={() => onUpdate?.(removeListItem(content, "stats", i))} />
            )}
            <EditableText
              value={str(stat?.value)}
              editable={editable}
              onChange={v => onUpdate?.(patchListField(content, "stats", i, "value", v))}
              tag="span"
              className="text-5xl font-black mb-2 leading-none"
              style={{ color: theme.accent }}
              placeholder="42%"
            />
            <EditableText
              value={str(stat?.label)}
              editable={editable}
              onChange={v => onUpdate?.(patchListField(content, "stats", i, "label", v))}
              tag="span"
              className="font-bold text-sm text-center"
              style={{ color: theme.heading }}
              placeholder="Label"
            />
            <EditableText
              value={str(stat?.context)}
              editable={editable}
              onChange={v => onUpdate?.(patchListField(content, "stats", i, "context", v))}
              tag="span"
              className="text-xs mt-2 text-center leading-snug"
              style={{ color: theme.muted }}
              placeholder=""
            />
          </div>
        ))}
        {editable && stats.length < 4 && (
          <div className="flex items-center justify-center">
            <AddItemButton
              theme={theme}
              label="Add stat"
              onClick={() => onUpdate?.(appendListItem(content, "stats",
                { value: "0%", label: "Label", context: "" }))}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function BigNumberLayout({ content, theme, editable, onUpdate }: any) {
  const title = str(content?.title);
  const value = str(content?.value);
  const label = str(content?.label);
  const context = str(content?.context);
  return (
    <div className="absolute inset-0 flex flex-col p-10">
      <EditableText
        value={title}
        editable={editable}
        onChange={v => onUpdate?.({ content: { ...content, title: v } })}
        tag="h2"
        className="text-2xl font-bold"
        style={{ color: theme.heading }}
        placeholder="Headline"
      />
      <div className="mt-2 h-1 w-12 rounded-full" style={{ backgroundColor: theme.accent }} />
      <div className="flex-1 flex flex-col items-center justify-center min-h-0">
        <EditableText
          value={value}
          editable={editable}
          onChange={v => onUpdate?.({ content: { ...content, value: v } })}
          tag="span"
          className="font-black leading-none"
          style={{ color: theme.accent, fontSize: "10rem" }}
          placeholder="87%"
        />
        <EditableText
          value={label}
          editable={editable}
          onChange={v => onUpdate?.({ content: { ...content, label: v } })}
          tag="span"
          className="text-3xl font-bold mt-3"
          style={{ color: theme.heading }}
          placeholder="What it means"
        />
        <EditableText
          value={context}
          editable={editable}
          onChange={v => onUpdate?.({ content: { ...content, context: v } })}
          tag="span"
          className="text-sm mt-3 max-w-2xl text-center"
          style={{ color: theme.muted }}
          placeholder="One-line context"
        />
      </div>
    </div>
  );
}

function QuoteLayout({ content, theme, editable, onUpdate }: any) {
  const quote = str(content?.quote);
  const attribution = str(content?.attribution);
  const role = str(content?.role);
  return (
    <div className="absolute inset-0 flex flex-col p-14 justify-center">
      <div className="text-8xl font-serif leading-none mb-2" style={{ color: theme.accent }}>"</div>
      <EditableText
        value={quote}
        editable={editable}
        onChange={v => onUpdate?.({ content: { ...content, quote: v } })}
        tag="p"
        className="text-3xl font-bold leading-snug max-w-4xl"
        style={{ color: theme.heading }}
        placeholder="The quote text…"
      />
      <div className="mt-6 h-1 w-12 rounded-full" style={{ backgroundColor: theme.accent }} />
      <EditableText
        value={attribution}
        editable={editable}
        onChange={v => onUpdate?.({ content: { ...content, attribution: v } })}
        tag="p"
        className="text-lg font-bold mt-4"
        style={{ color: theme.accent }}
        placeholder="Author name"
      />
      <EditableText
        value={role}
        editable={editable}
        onChange={v => onUpdate?.({ content: { ...content, role: v } })}
        tag="p"
        className="text-sm"
        style={{ color: theme.muted }}
        placeholder="Role / source"
      />
    </div>
  );
}

function TimelineLayout({ content, theme, editable, onUpdate }: any) {
  const title = str(content?.title);
  const events = arr(content?.events).slice(0, 5);
  return (
    <div className="absolute inset-0 flex flex-col p-10">
      <SlideHeader title={title} theme={theme} editable={editable} onUpdate={onUpdate} content={content} />
      <div className="relative flex-1 mt-4 min-h-0">
        <div className="absolute left-0 right-0 h-0.5 top-4" style={{ backgroundColor: theme.border }} />
        <div className="flex justify-between">
          {events.map((evt: any, i: number) => (
            <div key={i} className="relative flex flex-col items-center px-2 group/item"
                 style={{ width: `${100 / Math.max(events.length, 1)}%` }}>
              {editable && (
                <RemoveItemButton onClick={() => onUpdate?.(removeListItem(content, "events", i))} />
              )}
              <div className="w-8 h-8 rounded-full flex items-center justify-center z-10"
                style={{ backgroundColor: theme.accent }}>
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: theme.bg }} />
              </div>
              <EditableText
                value={str(evt?.year)}
                editable={editable}
                onChange={v => onUpdate?.(patchListField(content, "events", i, "year", v))}
                tag="span"
                className="text-base font-bold mt-3 text-center"
                style={{ color: theme.accent }}
                placeholder="2024"
              />
              <EditableText
                value={str(evt?.label)}
                editable={editable}
                onChange={v => onUpdate?.(patchListField(content, "events", i, "label", v))}
                tag="span"
                className="text-sm font-semibold mt-1 text-center"
                style={{ color: theme.heading }}
                placeholder="Milestone"
              />
              <EditableText
                value={str(evt?.description)}
                editable={editable}
                onChange={v => onUpdate?.(patchListField(content, "events", i, "description", v))}
                tag="span"
                className="text-xs mt-1 text-center leading-snug"
                style={{ color: theme.muted }}
                placeholder="…"
              />
            </div>
          ))}
        </div>
        {editable && events.length < 5 && (
          <div className="absolute right-0 -bottom-2">
            <AddItemButton
              theme={theme}
              label="Add event"
              onClick={() => onUpdate?.(appendListItem(content, "events",
                { year: "2024", label: "Event", description: "" }))}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// NEW — Numbered horizontal steps with arrows between them.
function ProcessStepsLayout({ content, theme, editable, onUpdate }: any) {
  const title = str(content?.title);
  const steps = arr(content?.steps).slice(0, 5);
  return (
    <div className="absolute inset-0 flex flex-col p-10">
      <SlideHeader title={title} theme={theme} editable={editable} onUpdate={onUpdate} content={content} />
      <div className="flex-1 flex items-center gap-2 min-h-0">
        {steps.map((step: any, i: number) => (
          <React.Fragment key={i}>
            <div className="relative flex-1 rounded-2xl p-4 flex flex-col overflow-hidden h-full justify-center group/item"
                 style={{ backgroundColor: theme.secondary, border: `1px solid ${theme.border}` }}>
              {editable && (
                <RemoveItemButton onClick={() => onUpdate?.(removeListItem(content, "steps", i))} />
              )}
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-base font-black mb-3 flex-shrink-0"
                   style={{ backgroundColor: theme.accent, color: theme.bg }}>
                {String(i + 1).padStart(2, "0")}
              </div>
              <EditableText
                value={str(step?.heading)}
                editable={editable}
                onChange={v => onUpdate?.(patchListField(content, "steps", i, "heading", v))}
                tag="h3"
                className="text-base font-bold mb-1.5 leading-tight"
                style={{ color: theme.heading }}
                placeholder="Step heading"
              />
              <EditableText
                value={str(step?.description)}
                editable={editable}
                onChange={v => onUpdate?.(patchListField(content, "steps", i, "description", v))}
                tag="p"
                className="text-xs leading-snug"
                style={{ color: theme.text }}
                placeholder="Describe this step…"
              />
            </div>
            {i < steps.length - 1 && (
              <ArrowRight className="w-5 h-5 flex-shrink-0" style={{ color: theme.accent }} strokeWidth={3} />
            )}
          </React.Fragment>
        ))}
        {editable && steps.length < 5 && (
          <AddItemButton
            theme={theme}
            label="+"
            onClick={() => onUpdate?.(appendListItem(content, "steps",
              { heading: "Next step", description: "Describe this step." }))}
          />
        )}
      </div>
    </div>
  );
}

// NEW — 3-4 level pyramid for hierarchical content.
function PyramidLayout({ content, theme, editable, onUpdate }: any) {
  const title = str(content?.title);
  const levels = arr(content?.levels).slice(0, 4);
  return (
    <div className="absolute inset-0 flex flex-col p-10">
      <SlideHeader title={title} theme={theme} editable={editable} onUpdate={onUpdate} content={content} />
      <div className="flex-1 flex flex-col items-center justify-center gap-2 mt-2 min-h-0">
        {levels.map((lv: any, i: number) => {
          const widthPct = 30 + (i / Math.max(levels.length - 1, 1)) * 60;
          return (
            <div key={i}
                 className="relative rounded-xl px-5 py-3 flex items-center justify-between gap-3 group/item"
                 style={{
                   width: `${widthPct}%`,
                   backgroundColor: theme.accent,
                   opacity: 0.55 + (i / Math.max(levels.length - 1, 1)) * 0.45,
                 }}>
              {editable && (
                <RemoveItemButton onClick={() => onUpdate?.(removeListItem(content, "levels", i))} />
              )}
              <EditableText
                value={str(lv?.label)}
                editable={editable}
                onChange={v => onUpdate?.(patchListField(content, "levels", i, "label", v))}
                tag="span"
                className="text-base font-bold leading-tight flex-1"
                style={{ color: theme.bg }}
                placeholder="Level"
              />
              <EditableText
                value={str(lv?.description)}
                editable={editable}
                onChange={v => onUpdate?.(patchListField(content, "levels", i, "description", v))}
                tag="span"
                className="text-xs leading-snug text-right max-w-[55%]"
                style={{ color: theme.bg }}
                placeholder=""
              />
            </div>
          );
        })}
        {editable && levels.length < 4 && (
          <AddItemButton
            theme={theme}
            label="Add level"
            onClick={() => onUpdate?.(appendListItem(content, "levels",
              { label: "New level" }))}
          />
        )}
      </div>
    </div>
  );
}

function ComparisonLayout({ content, theme, editable, onUpdate }: any) {
  const title = str(content?.title);
  const patchOpt = (key: string, field: string, value: any) => {
    const cur = content?.[key] || {};
    return onUpdate?.({ content: { ...content, [key]: { ...cur, [field]: value } } });
  };
  const patchOptList = (key: string, field: "pros"|"cons", i: number, v: string) => {
    const cur = content?.[key] || {};
    const list = Array.isArray(cur[field]) ? [...cur[field]] : [];
    list[i] = v;
    return patchOpt(key, field, list);
  };
  return (
    <div className="absolute inset-0 flex flex-col p-10">
      <SlideHeader title={title} theme={theme} editable={editable} onUpdate={onUpdate} content={content} />
      <div className="flex flex-1 gap-5 mt-2 min-h-0">
        {["option_a", "option_b"].map(key => {
          const opt = content?.[key] || {};
          return (
            <div key={key} className="flex-1 rounded-2xl p-5 flex flex-col overflow-hidden"
                 style={{ backgroundColor: theme.secondary, border: `1px solid ${theme.border}` }}>
              <EditableText
                value={str(opt?.label)}
                editable={editable}
                onChange={v => patchOpt(key, "label", v)}
                tag="h3"
                className="text-xl font-bold mb-2"
                style={{ color: theme.accent }}
                placeholder="Option label"
              />
              <div className="h-0.5 w-10 rounded-full mb-3" style={{ backgroundColor: theme.accent }} />
              <div className="space-y-3 flex-1 min-h-0 overflow-hidden">
                {(["pros", "cons"] as const).map((bucket) => (
                  <div key={bucket}>
                    <p className="text-[10px] uppercase tracking-wider font-bold mb-1.5"
                       style={{ color: theme.muted }}>{bucket}</p>
                    <ul className="space-y-1">
                      {arr(opt?.[bucket]).slice(0, 4).map((p: any, i: number) => (
                        <li key={i} className="flex items-start gap-2 text-sm" style={{ color: theme.text }}>
                          <span className={bucket === "pros" ? "text-emerald-500 mt-0.5 font-bold"
                                                              : "text-red-500 mt-0.5 font-bold"}>
                            {bucket === "pros" ? "✓" : "✗"}
                          </span>
                          <EditableText
                            value={str(p)}
                            editable={editable}
                            onChange={v => patchOptList(key, bucket, i, v)}
                            tag="span"
                            className="flex-1"
                            placeholder={bucket === "pros" ? "Pro" : "Con"}
                            style={{ color: theme.text }}
                          />
                        </li>
                      ))}
                      {editable && (
                        <li>
                          <AddItemButton
                            theme={theme}
                            label={`Add ${bucket === "pros" ? "pro" : "con"}`}
                            onClick={() => {
                              const cur = content?.[key] || {};
                              const list = Array.isArray(cur[bucket]) ? [...cur[bucket]] : [];
                              list.push(bucket === "pros" ? "New advantage" : "New drawback");
                              patchOpt(key, bucket, list);
                            }}
                          />
                        </li>
                      )}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TeamLayout({ content, theme, editable, onUpdate }: any) {
  const title = str(content?.title) || "Meet the Team";
  const members = arr(content?.members).slice(0, 4);
  return (
    <div className="absolute inset-0 flex flex-col p-10">
      <EditableText
        value={title}
        editable={editable}
        onChange={v => onUpdate?.({ content: { ...content, title: v } })}
        tag="h2"
        className="text-3xl font-bold"
        style={{ color: theme.heading }}
        placeholder="Meet the Team"
      />
      <div className="mt-2 h-1 w-12 rounded-full" style={{ backgroundColor: theme.accent }} />
      <div className="flex gap-4 mt-6 flex-1 min-h-0">
        {members.map((m: any, i: number) => {
          const name = str(m?.name) || "?";
          return (
            <div key={i} className="relative flex-1 flex flex-col items-center rounded-2xl p-4 overflow-hidden group/item"
                 style={{ backgroundColor: theme.secondary, border: `1px solid ${theme.border}` }}>
              {editable && (
                <RemoveItemButton onClick={() => onUpdate?.(removeListItem(content, "members", i))} />
              )}
              <div className="w-20 h-20 rounded-full flex items-center justify-center text-3xl font-black mb-3 flex-shrink-0"
                style={{ backgroundColor: theme.accent, color: theme.bg }}>
                {name[0].toUpperCase()}
              </div>
              <EditableText
                value={name === "?" ? "" : name}
                editable={editable}
                onChange={v => onUpdate?.(patchListField(content, "members", i, "name", v))}
                tag="p"
                className="font-bold text-base text-center"
                style={{ color: theme.heading }}
                placeholder="Name"
              />
              <EditableText
                value={str(m?.role)}
                editable={editable}
                onChange={v => onUpdate?.(patchListField(content, "members", i, "role", v))}
                tag="p"
                className="text-sm mt-1 font-medium"
                style={{ color: theme.accent }}
                placeholder="Role"
              />
              <EditableText
                value={str(m?.bio)}
                editable={editable}
                onChange={v => onUpdate?.(patchListField(content, "members", i, "bio", v))}
                tag="p"
                className="text-xs mt-2 text-center leading-snug"
                style={{ color: theme.muted }}
                placeholder="Short bio"
              />
            </div>
          );
        })}
        {editable && members.length < 4 && (
          <div className="flex items-center">
            <AddItemButton
              theme={theme}
              label="Add"
              onClick={() => onUpdate?.(appendListItem(content, "members",
                { name: "New Member", role: "Role", bio: "Bio." }))}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// NEW — Team with portrait images instead of initial-avatars.
// Matches the "Pioneers of Organizational Thought" Gamma layout.
function TeamImageGridLayout({ content, theme, editable, onUpdate }: any) {
  const title = str(content?.title) || "Team";
  const members = arr(content?.members).slice(0, 3);
  return (
    <div className="absolute inset-0 flex flex-col p-10">
      <EditableText
        value={title}
        editable={editable}
        onChange={v => onUpdate?.({ content: { ...content, title: v } })}
        tag="h2"
        className="text-4xl font-black"
        style={{ color: theme.heading }}
        placeholder="Team"
      />
      <div className="flex gap-6 mt-6 flex-1 min-h-0">
        {members.map((m: any, i: number) => {
          const name = str(m?.name) || "?";
          const img  = str(m?.image_url);
          return (
            <div key={i} className="relative flex-1 flex flex-col overflow-hidden group/item">
              {editable && (
                <RemoveItemButton onClick={() => onUpdate?.(removeListItem(content, "members", i))} />
              )}
              <div className="rounded-2xl overflow-hidden mb-3 flex-shrink-0"
                   style={{ backgroundColor: theme.secondary, aspectRatio: "4/5",
                            border: `1px solid ${theme.border}` }}>
                {img ? (
                  <img src={img} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-5xl font-black"
                       style={{ color: theme.accent }}>
                    {name[0].toUpperCase()}
                  </div>
                )}
              </div>
              <EditableText
                value={name === "?" ? "" : name}
                editable={editable}
                onChange={v => onUpdate?.(patchListField(content, "members", i, "name", v))}
                tag="p"
                className="font-bold text-xl"
                style={{ color: theme.heading }}
                placeholder="Name"
              />
              <EditableText
                value={str(m?.bio)}
                editable={editable}
                onChange={v => onUpdate?.(patchListField(content, "members", i, "bio", v))}
                tag="p"
                className="text-sm mt-2 leading-relaxed"
                style={{ color: theme.text }}
                placeholder="Short bio…"
              />
            </div>
          );
        })}
        {editable && members.length < 3 && (
          <div className="flex items-start pt-12">
            <AddItemButton
              theme={theme}
              label="Add member"
              onClick={() => onUpdate?.(appendListItem(content, "members",
                { name: "New Member", bio: "Short bio." }))}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function IconGridLayout({ content, theme, editable, onUpdate }: any) {
  const title = str(content?.title);
  const items = arr(content?.items).slice(0, 6);
  const cols = items.length > 4 ? 3 : 2;
  return (
    <div className="absolute inset-0 flex flex-col p-10">
      <SlideHeader title={title} theme={theme} editable={editable} onUpdate={onUpdate} content={content} />
      <div
        className="grid gap-4 mt-1 flex-1 min-h-0"
        style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
      >
        {items.map((item: any, i: number) => (
          <div key={i}
               className="relative rounded-2xl p-4 flex flex-col overflow-hidden group/item"
               style={{ backgroundColor: theme.secondary, border: `1px solid ${theme.border}` }}>
            {editable && (
              <RemoveItemButton onClick={() => onUpdate?.(removeListItem(content, "items", i))} />
            )}
            <EditableText
              value={str(item?.icon) || "●"}
              editable={editable}
              onChange={v => onUpdate?.(patchListField(content, "items", i, "icon", v))}
              tag="div"
              className="w-11 h-11 rounded-xl flex items-center justify-center text-xl mb-2.5 flex-shrink-0"
              style={{ backgroundColor: `${theme.accent}25`, color: theme.accent }}
              placeholder="●"
            />
            <EditableText
              value={str(item?.heading)}
              editable={editable}
              onChange={v => onUpdate?.(patchListField(content, "items", i, "heading", v))}
              tag="p"
              className="font-bold text-base leading-tight"
              style={{ color: theme.heading }}
              placeholder="Heading"
            />
            <EditableText
              value={str(item?.description)}
              editable={editable}
              onChange={v => onUpdate?.(patchListField(content, "items", i, "description", v))}
              tag="p"
              className="text-xs mt-1.5 leading-snug"
              style={{ color: theme.muted }}
              placeholder="Describe…"
            />
          </div>
        ))}
        {editable && items.length < 6 && (
          <div className="flex items-center justify-center">
            <AddItemButton
              theme={theme}
              label="Add tile"
              onClick={() => onUpdate?.(appendListItem(content, "items",
                { icon: "●", heading: "New tile", description: "Describe this tile." }))}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function AgendaLayout({ content, theme, editable, onUpdate }: any) {
  const title = str(content?.title) || "Agenda";
  const items = arr(content?.items).slice(0, 7);
  return (
    <div className="absolute inset-0 flex gap-10 p-10">
      <div className="w-2/5 flex-shrink-0">
        <EditableText
          value={title}
          editable={editable}
          onChange={v => onUpdate?.({ content: { ...content, title: v } })}
          tag="h2"
          className="text-5xl font-black leading-tight"
          style={{ color: theme.heading }}
          placeholder="Agenda"
        />
        <div className="mt-4 w-14 h-1.5 rounded-full" style={{ backgroundColor: theme.accent }} />
      </div>
      <div className="flex-1 flex flex-col justify-center space-y-2 overflow-hidden">
        {items.map((item: any, i: number) => (
          <div key={i} className="relative flex items-center gap-4 py-1.5 border-b group/item"
               style={{ borderColor: theme.border }}>
            {editable && (
              <RemoveItemButton onClick={() => onUpdate?.(removeListItem(content, "items", i))} />
            )}
            <span className="text-2xl font-black w-10 flex-shrink-0" style={{ color: theme.accent }}>
              {str(item?.number) || String(i + 1).padStart(2, "0")}
            </span>
            <EditableText
              value={str(item?.label)}
              editable={editable}
              onChange={v => onUpdate?.(patchListField(content, "items", i, "label", v))}
              tag="span"
              className="text-lg font-medium flex-1"
              style={{ color: theme.text }}
              placeholder="Agenda item"
            />
          </div>
        ))}
        {editable && items.length < 7 && (
          <AddItemButton
            theme={theme}
            label="Add item"
            onClick={() => onUpdate?.(appendListItem(content, "items",
              { label: "New item" }))}
          />
        )}
      </div>
    </div>
  );
}

function CTALayout({ content, theme, editable, onUpdate }: any) {
  const title = str(content?.title);
  const subtitle = str(content?.subtitle);
  const buttonLabel = str(content?.button_label);
  const contact = str(content?.contact);
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center p-14 text-center">
      <EditableText
        value={title}
        editable={editable}
        onChange={v => onUpdate?.({ content: { ...content, title: v } })}
        tag="h1"
        className="text-6xl font-black leading-tight tracking-tight"
        style={{ color: theme.heading }}
        placeholder="Call to action"
      />
      <EditableText
        value={subtitle}
        editable={editable}
        onChange={v => onUpdate?.({ content: { ...content, subtitle: v } })}
        tag="p"
        className="text-xl mt-5 max-w-3xl"
        style={{ color: theme.muted }}
        placeholder="Subtitle"
      />
      <EditableText
        value={buttonLabel}
        editable={editable}
        onChange={v => onUpdate?.({ content: { ...content, button_label: v } })}
        tag="div"
        className="mt-8 px-7 py-3 rounded-full font-bold text-lg shadow-lg"
        style={{ backgroundColor: theme.accent, color: theme.heading }}
        placeholder="Button label"
      />
      <EditableText
        value={contact}
        editable={editable}
        onChange={v => onUpdate?.({ content: { ...content, contact: v } })}
        tag="p"
        className="text-sm mt-7"
        style={{ color: theme.muted }}
        placeholder="hi@example.com"
      />
    </div>
  );
}

/** Pick black/white text for legibility on a coloured (e.g. accent) cell. */
function contrastOn(hex: string): string {
  const h = (hex || "#000000").replace("#", "");
  if (h.length < 6) return "#FFFFFF";
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? "#111111" : "#FFFFFF";
}

// Professional comparison table (Gamma-style). Schema:
//   { title, headers: ["Feature","Option A","Option B"(,"Option C")],
//     rows: [["Speed","Fast","Slow"], ["Stable","Yes","No"], ...] }
// First column is the row-label/feature; remaining columns are compared items.
// Supports 2-4 columns total (i.e. 1-3 things being compared).
function TableLayout({ content, theme, editable, onUpdate }: any) {
  const title = str(content?.title);
  const headers = arr(content?.headers).map((h: any) => str(h));
  const rows = arr(content?.rows);
  const cols = Math.max(
    headers.length,
    ...rows.map((r: any) => arr(r).length),
    2,
  );
  const headerText = contrastOn(theme.accent);

  const setHeader = (i: number, v: string) => {
    const h = headers.length ? [...headers] : Array(cols).fill("");
    while (h.length < cols) h.push("");
    h[i] = v;
    onUpdate?.({ content: { ...content, headers: h } });
  };
  const setCell = (ri: number, ci: number, v: string) => {
    const rs = rows.map((r: any) => {
      const cells = arr(r).map((c: any) => str(c));
      while (cells.length < cols) cells.push("");
      return cells;
    });
    rs[ri][ci] = v;
    onUpdate?.({ content: { ...content, rows: rs } });
  };
  const addRow = () => {
    const rs = rows.map((r: any) => arr(r).map((c: any) => str(c)));
    rs.push(Array(cols).fill("New"));
    onUpdate?.({ content: { ...content, rows: rs } });
  };
  const removeRow = (ri: number) => {
    const rs = rows.map((r: any) => arr(r).map((c: any) => str(c)));
    rs.splice(ri, 1);
    onUpdate?.({ content: { ...content, rows: rs } });
  };

  const gridCols = `1.3fr ${Array(Math.max(cols - 1, 1)).fill("1fr").join(" ")}`;

  return (
    <div className="absolute inset-0 flex flex-col p-10">
      <SlideHeader title={title} theme={theme} editable={editable} onUpdate={onUpdate} content={content} />
      <div
        className="flex-1 min-h-0 rounded-2xl overflow-hidden flex flex-col"
        style={{ border: `1px solid ${theme.border}` }}
      >
        {/* Header row */}
        <div className="grid flex-shrink-0" style={{ gridTemplateColumns: gridCols, backgroundColor: theme.accent }}>
          {Array.from({ length: cols }).map((_, ci) => (
            <div
              key={ci}
              className="px-4 py-3 font-bold text-sm"
              style={{
                color: headerText,
                borderRight: ci < cols - 1 ? `1px solid ${theme.bg}22` : "none",
                textAlign: ci === 0 ? "left" : "center",
              }}
            >
              <EditableText
                value={str(headers[ci])}
                editable={editable}
                onChange={(v) => setHeader(ci, v)}
                tag="span"
                className="font-bold"
                style={{ color: headerText }}
                placeholder={ci === 0 ? "Feature" : `Option ${ci}`}
              />
            </div>
          ))}
        </div>
        {/* Body rows */}
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          {rows.map((row: any, ri: number) => {
            const cells = arr(row);
            const zebra = ri % 2 === 1;
            return (
              <div
                key={ri}
                className="grid group/row relative flex-1"
                style={{
                  gridTemplateColumns: gridCols,
                  backgroundColor: zebra ? theme.secondary : "transparent",
                  borderTop: `1px solid ${theme.border}`,
                }}
              >
                {Array.from({ length: cols }).map((_, ci) => (
                  <div
                    key={ci}
                    className="px-4 py-2.5 flex items-center"
                    style={{
                      borderRight: ci < cols - 1 ? `1px solid ${theme.border}` : "none",
                      justifyContent: ci === 0 ? "flex-start" : "center",
                    }}
                  >
                    <EditableText
                      value={str(cells[ci])}
                      editable={editable}
                      onChange={(v) => setCell(ri, ci, v)}
                      tag="span"
                      className={`text-sm ${ci === 0 ? "font-semibold" : ""}`}
                      style={{ color: ci === 0 ? theme.heading : theme.text }}
                      placeholder="—"
                    />
                  </div>
                ))}
                {editable && (
                  <button
                    onClick={() => removeRow(ri)}
                    className="absolute right-1 top-1 w-5 h-5 rounded-full flex items-center justify-center bg-black/30 text-white/70 opacity-0 group-hover/row:opacity-100 hover:bg-red-500/80 transition-all"
                    title="Remove row"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {editable && (
        <button
          onClick={addRow}
          className="mt-2 flex items-center gap-1.5 text-xs opacity-60 hover:opacity-100 transition-opacity self-start"
          style={{ color: theme.accent }}
        >
          <Plus className="w-3.5 h-3.5" /> Add row
        </button>
      )}
    </div>
  );
}

function BlankLayout({ theme }: any) {
  return <div className="absolute inset-0" style={{ backgroundColor: theme.bg }} />;
}

// Dedicated code slide — monospace panel that preserves indentation/newlines.
function CodeLayout({ content, theme, editable, onUpdate }: any) {
  const title = str(content?.title);
  const language = str(content?.language) || "code";
  const code = str(content?.code);
  const caption = str(content?.caption);
  return (
    <div className="absolute inset-0 flex flex-col p-10">
      <SlideHeader title={title} theme={theme} editable={editable} onUpdate={onUpdate} content={content} />
      <div className="flex items-center gap-2 -mt-1 mb-2">
        <EditableText
          value={language}
          editable={editable}
          onChange={(v) => onUpdate?.({ content: { ...content, language: v } })}
          tag="span"
          className="text-[11px] font-bold uppercase tracking-[0.15em] px-2 py-0.5 rounded"
          style={{ color: theme.accent, backgroundColor: `${theme.accent}1A` }}
          placeholder="language"
          rich={false}
        />
      </div>
      <div className="flex-1 min-h-0 rounded-xl overflow-hidden border shadow-lg"
           style={{ backgroundColor: "#0D1117", borderColor: theme.border }}>
        <pre
          contentEditable={editable}
          suppressContentEditableWarning
          spellCheck={false}
          onBlur={(e) => onUpdate?.({ content: { ...content, code: e.currentTarget.textContent || "" } })}
          className="h-full w-full overflow-auto p-4 text-[13px] leading-relaxed font-mono whitespace-pre focus:outline-none"
          style={{ color: "#E6EDF3", tabSize: 4 as any }}
        >{code || (editable ? "// write or paste your code here…" : "")}</pre>
      </div>
      {(caption || editable) && (
        <EditableText
          value={caption}
          editable={editable}
          onChange={(v) => onUpdate?.({ content: { ...content, caption: v } })}
          tag="p"
          className="text-sm mt-2.5"
          style={{ color: theme.muted }}
          placeholder="Optional one-line explanation…"
        />
      )}
    </div>
  );
}

// ── Main Renderer ─────────────────────────────────────────────────────────

export default function SlideRenderer({ slide, theme, onUpdate, editable }: SlideRendererProps) {
  let content: any = {};
  if (slide?.content) {
    if (typeof slide.content === "string") {
      try { content = JSON.parse(slide.content); } catch { content = {}; }
    } else if (typeof slide.content === "object" && !Array.isArray(slide.content)) {
      content = slide.content;
    }
  }

  const commonProps = { content, theme, editable, onUpdate };

  const layouts: Record<string, React.ReactNode> = {
    title:            <TitleLayout         {...commonProps} />,
    section_header:   <SectionHeaderLayout {...commonProps} />,
    bullets:          <BulletsLayout       {...commonProps} />,
    two_column:       <TwoColumnLayout     {...commonProps} />,
    arrow_columns:    <ArrowColumnsLayout  {...commonProps} />,
    image_left:       <ImageSideLayout     {...commonProps} imageLeft={true} />,
    image_right:      <ImageSideLayout     {...commonProps} imageLeft={false} />,
    image_with_cards: <ImageWithCardsLayout {...commonProps} />,
    stats:            <StatsLayout         {...commonProps} />,
    big_number:       <BigNumberLayout     {...commonProps} />,
    quote:            <QuoteLayout         {...commonProps} />,
    timeline:         <TimelineLayout      {...commonProps} />,
    process_steps:    <ProcessStepsLayout  {...commonProps} />,
    pyramid:          <PyramidLayout       {...commonProps} />,
    comparison:       <ComparisonLayout    {...commonProps} />,
    team:             <TeamLayout          {...commonProps} />,
    team_image_grid:  <TeamImageGridLayout {...commonProps} />,
    icon_grid:        <IconGridLayout      {...commonProps} />,
    agenda:           <AgendaLayout        {...commonProps} />,
    cta:              <CTALayout           {...commonProps} />,
    code:             <CodeLayout          {...commonProps} />,
    table:            <TableLayout         {...commonProps} />,
    blank:            <BlankLayout theme={theme} />,
    // Smart Diagrams
    funnel:             <FunnelDiagram             {...commonProps} />,
    concentric_circles: <ConcentricCirclesDiagram  {...commonProps} />,
    venn:               <VennDiagram               {...commonProps} />,
    target:             <TargetDiagram             {...commonProps} />,
    connected_circles:  <ConnectedCirclesDiagram   {...commonProps} />,
    // Smart Charts
    bar_chart:          <BarChart                  {...commonProps} />,
    line_chart:         <LineChart                 {...commonProps} />,
    area_chart:         <AreaChart                 {...commonProps} />,
    pie_chart:          <PieChart                  {...commonProps} />,
    donut_chart:        <DonutChart                {...commonProps} />,
  };

  const layoutKey = slide?.layout_type || "bullets";

  // Use the optional CSS gradient if the theme defines one; otherwise solid bg.
  const bgStyle: React.CSSProperties = {
    background: (theme as any).bgGradient || theme.bg,
    aspectRatio: "16/9",
    fontFamily: "Inter, system-ui, sans-serif",
  };

  const overlays = Array.isArray(content?.overlays) ? content.overlays : [];

  return (
    <div
      className="relative w-full rounded-2xl shadow-2xl overflow-hidden"
      style={bgStyle}
    >
      {layouts[layoutKey] ?? layouts.bullets}
      <OverlayLayer
        overlays={overlays}
        editable={editable}
        onChange={(next) =>
          onUpdate?.({ content: { ...content, overlays: next } })
        }
      />
    </div>
  );
}
