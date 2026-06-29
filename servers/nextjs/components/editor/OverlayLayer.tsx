"use client";
import React, { useEffect, useRef, useState } from "react";
import { X, Move, Maximize2 } from "lucide-react";

/**
 * Renders + edits the slide's `content.overlays` array.
 *
 * Overlay shape (all coords normalised 0-1 against the slide):
 *   { id, type:"image", src, x, y, w, h, z? }
 *
 * Drag with the move handle (whole overlay) to reposition.
 * Drag the bottom-right corner to resize.
 * Click the × to delete.
 *
 * Coordinates are normalised so the same overlay survives slide-canvas
 * resizing AND maps 1:1 to the PPTX export (slide is 13.33×7.5 inches —
 * the exporter multiplies the normalised coords by those numbers).
 */

export interface Overlay {
  id: string;
  type: "image";
  src: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z?: number;
}

export interface OverlayLayerProps {
  overlays: Overlay[];
  editable?: boolean;
  onChange?: (next: Overlay[]) => void;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export default function OverlayLayer({ overlays, editable, onChange }: OverlayLayerProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Clicking on the slide outside any overlay deselects.
    const handler = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest("[data-overlay]")) setSelectedId(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const updateOverlay = (id: string, patch: Partial<Overlay>) => {
    onChange?.(overlays.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  };

  const removeOverlay = (id: string) => {
    onChange?.(overlays.filter((o) => o.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 5 }}
    >
      {overlays.map((o) => (
        <OverlayItem
          key={o.id}
          overlay={o}
          editable={!!editable}
          selected={selectedId === o.id}
          onSelect={() => setSelectedId(o.id)}
          onChange={(patch) => updateOverlay(o.id, patch)}
          onRemove={() => removeOverlay(o.id)}
          containerRef={containerRef}
        />
      ))}
    </div>
  );
}

interface OverlayItemProps {
  overlay: Overlay;
  editable: boolean;
  selected: boolean;
  onSelect: () => void;
  onChange: (patch: Partial<Overlay>) => void;
  onRemove: () => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

function OverlayItem({
  overlay, editable, selected, onSelect, onChange, onRemove, containerRef,
}: OverlayItemProps) {
  const draggingRef = useRef<null | {
    mode: "move" | "resize";
    startX: number; startY: number;
    startOx: number; startOy: number;
    startOw: number; startOh: number;
    parentW: number; parentH: number;
  }>(null);

  const handlePointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    mode: "move" | "resize",
  ) => {
    if (!editable) return;
    e.stopPropagation();
    e.preventDefault();
    onSelect();
    const parent = containerRef.current;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    draggingRef.current = {
      mode,
      startX: e.clientX,
      startY: e.clientY,
      startOx: overlay.x,
      startOy: overlay.y,
      startOw: overlay.w,
      startOh: overlay.h,
      parentW: rect.width,
      parentH: rect.height,
    };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const d = draggingRef.current;
    if (!d) return;
    const dx = (e.clientX - d.startX) / d.parentW;
    const dy = (e.clientY - d.startY) / d.parentH;
    if (d.mode === "move") {
      onChange({
        x: clamp01(d.startOx + dx),
        y: clamp01(d.startOy + dy),
      });
    } else {
      onChange({
        w: Math.max(0.05, Math.min(1 - overlay.x, d.startOw + dx)),
        h: Math.max(0.05, Math.min(1 - overlay.y, d.startOh + dy)),
      });
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (draggingRef.current) {
      (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
      draggingRef.current = null;
    }
  };

  const styleAbs: React.CSSProperties = {
    position: "absolute",
    left: `${overlay.x * 100}%`,
    top: `${overlay.y * 100}%`,
    width: `${overlay.w * 100}%`,
    height: `${overlay.h * 100}%`,
    zIndex: overlay.z ?? 1,
    pointerEvents: "auto",
  };

  return (
    <div
      data-overlay
      style={styleAbs}
      className={`group ${selected ? "ring-2 ring-blue-500" : ""} ${editable ? "cursor-move" : ""}`}
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
      onPointerDown={(e) => handlePointerDown(e, "move")}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <img
        src={overlay.src}
        alt=""
        draggable={false}
        className="w-full h-full object-cover rounded shadow-lg select-none"
        onError={(e) => { (e.target as HTMLImageElement).style.opacity = "0.2"; }}
      />
      {editable && selected && (
        <>
          {/* Move chip top-left */}
          <div className="absolute -top-2 -left-2 w-5 h-5 rounded-full bg-blue-500 text-white flex items-center justify-center shadow">
            <Move className="w-3 h-3" />
          </div>
          {/* Delete top-right */}
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center shadow"
            title="Remove image"
          >
            <X className="w-3 h-3" />
          </button>
          {/* Resize handle bottom-right */}
          <div
            onPointerDown={(e) => handlePointerDown(e, "resize")}
            className="absolute -bottom-2 -right-2 w-5 h-5 rounded-full bg-blue-500 hover:bg-blue-600 text-white flex items-center justify-center shadow cursor-nwse-resize"
            title="Resize"
          >
            <Maximize2 className="w-3 h-3" />
          </div>
        </>
      )}
    </div>
  );
}
