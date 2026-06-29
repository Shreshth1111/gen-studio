"use client";
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  Link as LinkIcon, List, ListOrdered,
  AlignLeft, AlignCenter, AlignRight, Type,
} from "lucide-react";

/**
 * A contentEditable rich-text field with a floating toolbar that appears
 * above the editor while it has focus.
 *
 * Storage format: HTML string. Plain-text values still work — `value` may
 * be either plain text (no tags) or an HTML fragment. Display mode renders
 * accordingly so existing string fields keep working without migration.
 *
 * Marks supported (mirror the PPTX exporter):
 *   <strong>/<b>, <em>/<i>, <u>, <s>/<strike>/<del>, <a href>
 *   <span style="color:#...">, lists (ul/ol/li), alignment (text-align)
 */

const COLORS = [
  // First row mirrors theme tokens picked up at runtime; the second row is a
  // small fixed palette for emphasis colors.
  "currentColor",
  "#DC2626", "#F59E0B", "#10B981", "#06B6D4",
  "#3B82F6", "#8B5CF6", "#EC4899", "#94A3B8",
  "#FFFFFF", "#000000",
];

interface RichTextProps {
  value: string;
  onChange?: (html: string) => void;
  editable?: boolean;
  className?: string;
  style?: React.CSSProperties;
  /** When the value is empty, render this faint placeholder. */
  placeholder?: string;
  /** True (default) -> contentEditable rich editing. False -> plain textarea
   *  fallback (used by short atomic fields like a year, value, button label). */
  rich?: boolean;
  /** Element tag for display mode — defaults to `div`. Use `h1`/`h2`/`span`
   *  for proper semantics + matching default styling. */
  tag?: keyof JSX.IntrinsicElements;
  /** Theme colors so the toolbar's "text colour" row can offer the slide's
   *  current accent/heading. */
  themeColors?: string[];
}

function isPlainText(s: string): boolean {
  if (!s) return true;
  return !/<[a-z!\/][^>]*>/i.test(s);
}

/** Escape user-supplied plain text so we can safely setInnerHTML it on first
 *  load. After that the contentEditable controls HTML directly. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Convert any incoming string into the HTML the editor expects. */
function toHtml(s: string): string {
  if (!s) return "";
  if (isPlainText(s)) {
    // Preserve newlines as <br> so the editor displays them.
    return escapeHtml(s).replace(/\n/g, "<br>");
  }
  return s;
}

export default function RichText({
  value,
  onChange,
  editable,
  className,
  style,
  placeholder = "",
  rich = true,
  tag = "div",
  themeColors = [],
}: RichTextProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const [editing, setEditing] = useState(false);
  const [toolbarPos, setToolbarPos] = useState<{ top: number; left: number } | null>(null);
  const Tag = tag as any;

  // ── Display mode ─────────────────────────────────────────────────────────
  // Render `value` straight as HTML (or escaped plain text). Click to edit.
  const displayHtml = toHtml(value);
  if (!editing) {
    if (!editable) {
      return (
        <Tag
          className={className}
          style={style}
          {...(displayHtml
            ? { dangerouslySetInnerHTML: { __html: displayHtml } }
            : {})}
        >
          {displayHtml ? undefined : null}
        </Tag>
      );
    }
    return (
      <Tag
        onClick={() => setEditing(true)}
        className={`${className} cursor-text hover:bg-white/5 rounded px-1 transition-colors ${
          !value ? "opacity-40" : ""
        }`}
        style={style}
        {...(displayHtml
          ? { dangerouslySetInnerHTML: { __html: displayHtml } }
          : {})}
      >
        {displayHtml ? undefined : placeholder || "Click to edit…"}
      </Tag>
    );
  }

  // ── Edit mode ────────────────────────────────────────────────────────────
  return (
    <RichEditingShell
      ref={editorRef}
      initial={displayHtml}
      className={className}
      style={style}
      rich={rich}
      themeColors={themeColors}
      tag={tag}
      onCommit={(html) => {
        setEditing(false);
        setToolbarPos(null);
        const finalValue = isPlainText(html) ? html.replace(/<br\s*\/?>/g, "\n") : html;
        if (finalValue !== value) onChange?.(finalValue);
      }}
      onPositionToolbar={setToolbarPos}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal editing shell — mounted only while editing. Holds its own
// contentEditable element so React doesn't fight the DOM for cursor state.
// ─────────────────────────────────────────────────────────────────────────────

interface ShellProps {
  initial: string;
  className?: string;
  style?: React.CSSProperties;
  rich: boolean;
  themeColors: string[];
  tag: keyof JSX.IntrinsicElements;
  onCommit: (html: string) => void;
  onPositionToolbar: (pos: { top: number; left: number } | null) => void;
}

const RichEditingShell = React.forwardRef<HTMLDivElement, ShellProps>(function RichEditingShell(
  { initial, className, style, rich, themeColors, tag, onCommit, onPositionToolbar },
  ref,
) {
  const innerRef = useRef<HTMLDivElement | null>(null);
  const [colorMenuOpen, setColorMenuOpen] = useState(false);
  const [toolbarPos, setToolbarPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const Tag = tag as any;

  // Install initial HTML once on mount so React doesn't re-render the field
  // every keystroke (which would obliterate the cursor).
  useLayoutEffect(() => {
    if (innerRef.current) {
      innerRef.current.innerHTML = initial;
      // Focus + place caret at end.
      innerRef.current.focus();
      const range = document.createRange();
      range.selectNodeContents(innerRef.current);
      range.collapse(false);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      positionToolbar();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reposition the toolbar when the editor shifts (resize, scroll).
  useEffect(() => {
    const handler = () => positionToolbar();
    window.addEventListener("resize", handler);
    window.addEventListener("scroll", handler, true);
    return () => {
      window.removeEventListener("resize", handler);
      window.removeEventListener("scroll", handler, true);
    };
  });

  const positionToolbar = () => {
    if (!innerRef.current) return;
    const rect = innerRef.current.getBoundingClientRect();
    const pos = {
      top: Math.max(8, rect.top + window.scrollY - 44),
      left: rect.left + window.scrollX,
    };
    setToolbarPos(pos);
    onPositionToolbar(pos);
  };

  /** Wrap execCommand so we restore focus first and re-snapshot caret. */
  const exec = (cmd: string, val?: string) => {
    innerRef.current?.focus();
    try {
      document.execCommand(cmd, false, val);
    } catch {
      /* noop */
    }
    positionToolbar();
  };

  const handleBlur = (e: React.FocusEvent) => {
    // If focus moved INSIDE the toolbar, don't commit yet — the user is
    // clicking a button. Commit only when focus truly leaves the editor.
    const next = e.relatedTarget as HTMLElement | null;
    if (next && next.closest && next.closest("[data-rt-toolbar]")) return;
    if (!innerRef.current) return;
    let html = innerRef.current.innerHTML.trim();
    // Strip empty wrappers ContentEditable adds when input is blank.
    if (html === "<br>" || html === "<div><br></div>") html = "";
    onCommit(html);
  };

  const setRef = (el: HTMLDivElement | null) => {
    innerRef.current = el;
    if (typeof ref === "function") ref(el);
    else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = el;
  };

  return (
    <>
      <Tag
        ref={setRef}
        contentEditable={true}
        suppressContentEditableWarning
        onBlur={handleBlur}
        onKeyDown={(e: React.KeyboardEvent) => {
          // Esc commits and closes — convenience.
          if (e.key === "Escape") {
            (e.target as HTMLElement).blur();
          }
        }}
        className={`${className || ""} outline-none ring-2 ring-blue-500/40 ring-offset-1 ring-offset-transparent rounded px-1`}
        style={{ ...style, minHeight: "1em" }}
      />
      {rich && (
        <RichToolbar
          pos={toolbarPos}
          themeColors={themeColors}
          colorMenuOpen={colorMenuOpen}
          setColorMenuOpen={setColorMenuOpen}
          exec={exec}
        />
      )}
    </>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Floating toolbar
// ─────────────────────────────────────────────────────────────────────────────

function RichToolbar({
  pos, themeColors, colorMenuOpen, setColorMenuOpen, exec,
}: {
  pos: { top: number; left: number };
  themeColors: string[];
  colorMenuOpen: boolean;
  setColorMenuOpen: (b: boolean) => void;
  exec: (cmd: string, val?: string) => void;
}) {
  const palette = Array.from(new Set([...themeColors, ...COLORS])).filter(Boolean);

  // Render into a portal so the toolbar isn't clipped by overflow:hidden
  // ancestors (slide canvas, scroll containers, etc.).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const toolbar = (
    <div
      data-rt-toolbar
      // Prevent the toolbar from stealing the caret when the user clicks.
      onMouseDown={(e) => e.preventDefault()}
      className="z-[1000] flex items-center gap-0.5 bg-slate-900 border border-slate-700 rounded-lg shadow-2xl px-1.5 py-1 text-slate-200"
      style={{ position: "fixed", top: pos.top, left: pos.left }}
    >
      <ToolButton onClick={() => exec("bold")}        title="Bold (Ctrl+B)"><Bold className="w-3.5 h-3.5" /></ToolButton>
      <ToolButton onClick={() => exec("italic")}      title="Italic (Ctrl+I)"><Italic className="w-3.5 h-3.5" /></ToolButton>
      <ToolButton onClick={() => exec("underline")}   title="Underline (Ctrl+U)"><UnderlineIcon className="w-3.5 h-3.5" /></ToolButton>
      <ToolButton onClick={() => exec("strikeThrough")} title="Strikethrough"><Strikethrough className="w-3.5 h-3.5" /></ToolButton>
      <Sep />
      <ToolButton
        onClick={() => {
          const url = prompt("Link URL:");
          if (url) exec("createLink", url);
        }}
        title="Insert link"
      >
        <LinkIcon className="w-3.5 h-3.5" />
      </ToolButton>
      <Sep />
      <ToolButton onClick={() => exec("insertUnorderedList")} title="Bulleted list"><List className="w-3.5 h-3.5" /></ToolButton>
      <ToolButton onClick={() => exec("insertOrderedList")}   title="Numbered list"><ListOrdered className="w-3.5 h-3.5" /></ToolButton>
      <Sep />
      <ToolButton onClick={() => exec("justifyLeft")}   title="Align left"><AlignLeft className="w-3.5 h-3.5" /></ToolButton>
      <ToolButton onClick={() => exec("justifyCenter")} title="Align centre"><AlignCenter className="w-3.5 h-3.5" /></ToolButton>
      <ToolButton onClick={() => exec("justifyRight")}  title="Align right"><AlignRight className="w-3.5 h-3.5" /></ToolButton>
      <Sep />
      <div className="relative">
        <ToolButton onClick={() => setColorMenuOpen(!colorMenuOpen)} title="Text colour">
          <Type className="w-3.5 h-3.5" />
        </ToolButton>
        {colorMenuOpen && (
          <div
            className="absolute top-full left-0 mt-1 z-[1001] bg-slate-900 border border-slate-700 rounded-lg shadow-xl p-2 grid grid-cols-6 gap-1"
            onMouseDown={(e) => e.preventDefault()}
          >
            {palette.map((c, i) => (
              <button
                key={i}
                onClick={() => {
                  exec("foreColor", c);
                  setColorMenuOpen(false);
                }}
                className="w-5 h-5 rounded border border-slate-600 hover:scale-110 transition-transform"
                style={{ backgroundColor: c === "currentColor" ? "#888" : c }}
                title={c}
              />
            ))}
            <input
              type="color"
              onChange={(e) => {
                exec("foreColor", e.target.value);
                setColorMenuOpen(false);
              }}
              className="col-span-6 mt-1 w-full h-6 rounded border border-slate-600 bg-transparent cursor-pointer"
              title="Custom colour"
            />
          </div>
        )}
      </div>
    </div>
  );

  // Append to body so positioning is decoupled from the slide's transforms.
  return require("react-dom").createPortal(toolbar, document.body);
}

function ToolButton({
  onClick, title, children,
}: { onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="w-6 h-6 rounded flex items-center justify-center hover:bg-slate-700 transition-colors"
      type="button"
    >
      {children}
    </button>
  );
}

function Sep() {
  return <div className="w-px h-4 bg-slate-700 mx-0.5" />;
}
