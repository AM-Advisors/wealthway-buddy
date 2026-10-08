import { useEffect, useRef, useState } from "react";
import { BarChart3, Building2, Calendar, Check, FileText, Lightbulb, Scale, Shield, TrendingUp, Users } from "lucide-react";
import logoNavy from "@/assets/logo-navy.png.asset.json";
import logoWhite from "@/assets/logo-white.png.asset.json";
import logoTeal from "@/assets/logo-teal.png.asset.json";
import iconNavy from "@/assets/logo-icon-navy.png.asset.json";
import iconWhite from "@/assets/logo-icon-white.png.asset.json";
import iconTeal from "@/assets/logo-icon-teal.png.asset.json";
import { DESIGN_FORMATS, safeMargin, type BrandKit, type ChartLayer, type DesignDoc, type Layer, type Page } from "@/lib/marketing-design-model";

export const LOGO_SRC: Record<string, string> = {
  "logo:wordmark_navy": logoNavy.url, "logo:wordmark_white": logoWhite.url, "logo:wordmark_teal": logoTeal.url,
  "logo:icon_navy": iconNavy.url, "logo:icon_white": iconWhite.url, "logo:icon_teal": iconTeal.url,
};
export const resolveSrc = (s: string) => LOGO_SRC[s] ?? s;
const ICON_CMP: Record<string, any> = { chart: BarChart3, shield: Shield, check: Check, building: Building2, users: Users, scale: Scale, calendar: Calendar, lightbulb: Lightbulb, file: FileText, trend: TrendingUp };

function Chart({ l, kit }: { l: ChartLayer; kit: BrandKit }) {
  const max = Math.max(1, ...l.data.map((d) => Math.abs(d.value)));
  const txt = kit.typography.body;
  if (l.chart === "kpi") return <foreignObject x={l.x} y={l.y} width={l.w} height={l.h}><div style={{ display: "flex", gap: 24, height: "100%", fontFamily: txt }}>
    {l.data.map((d, i) => <div key={i} style={{ flex: 1, background: "rgba(255,255,255,0.08)", border: `2px solid ${l.color}`, borderRadius: 20, padding: 24, color: "#fff" }}>
      <div style={{ fontFamily: kit.typography.heading, fontWeight: 700, fontSize: l.h * 0.38, color: l.color }}>{d.value.toLocaleString()}{l.unit}</div>
      <div style={{ fontSize: l.h * 0.12 }}>{d.label}</div></div>)}</div></foreignObject>;
  if (l.chart === "donut") {
    const tot = l.data.reduce((s, d) => s + Math.max(0, d.value), 0) || 1, r = Math.min(l.w, l.h) / 2 - 10, cx = l.x + Math.min(l.w, l.h) / 2, cy = l.y + l.h / 2;
    let a = -Math.PI / 2;
    return <g>{l.data.map((d, i) => { const da = (Math.max(0, d.value) / tot) * Math.PI * 2, x1 = cx + r * Math.cos(a), y1 = cy + r * Math.sin(a); a += da; const x2 = cx + r * Math.cos(a), y2 = cy + r * Math.sin(a);
      return <path key={i} d={`M${x1} ${y1} A${r} ${r} 0 ${da > Math.PI ? 1 : 0} 1 ${x2} ${y2}`} stroke={i % 2 ? "#ffffff" : l.color} strokeOpacity={1 - i * 0.12} strokeWidth={r * 0.35} fill="none" />; })}
      {l.data.map((d, i) => <text key={i} x={l.x + Math.min(l.w, l.h) + 20} y={l.y + 40 + i * 44} fill="#fff" fontSize={30} fontFamily={txt}>{d.label}: {d.value}{l.unit}</text>)}</g>;
  }
  const bw = l.w / Math.max(1, l.data.length);
  if (l.chart === "line") return <g><polyline fill="none" stroke={l.color} strokeWidth={8} points={l.data.map((d, i) => `${l.x + bw * i + bw / 2},${l.y + l.h - 40 - (d.value / max) * (l.h - 60)}`).join(" ")} />
    {l.data.map((d, i) => <text key={i} x={l.x + bw * i + bw / 2} y={l.y + l.h - 6} fill="#fff" fontSize={24} textAnchor="middle" fontFamily={txt}>{d.label}</text>)}</g>;
  return <g>{l.data.map((d, i) => { const hh = (Math.abs(d.value) / max) * (l.h - 60); return <g key={i}>
    <rect x={l.x + bw * i + bw * 0.15} y={l.y + l.h - 40 - hh} width={bw * 0.7} height={hh} rx={8} fill={l.color} />
    <text x={l.x + bw * i + bw / 2} y={l.y + l.h - 6} fill="#fff" fontSize={24} textAnchor="middle" fontFamily={txt}>{d.label}</text></g>; })}</g>;
}

export function LayerView({ l, kit }: { l: Layer; kit: BrandKit }) {
  if (l.hidden) return null;
  if (l.type === "shape") {
    if (l.shape === "ellipse") return <ellipse cx={l.x + l.w / 2} cy={l.y + l.h / 2} rx={l.w / 2} ry={l.h / 2} fill={l.fill} opacity={l.opacity} />;
    if (l.shape === "line") return <line x1={l.x} y1={l.y + l.h / 2} x2={l.x + l.w} y2={l.y + l.h / 2} stroke={l.fill} strokeWidth={Math.max(2, l.h)} opacity={l.opacity} />;
    return <rect x={l.x} y={l.y} width={l.w} height={l.h} rx={l.radius} fill={l.fill} opacity={l.opacity} />;
  }
  if (l.type === "text") return <foreignObject x={l.x} y={l.y} width={l.w} height={l.h}>
    <div style={{ fontFamily: `${l.font === "heading" ? kit.typography.heading : kit.typography.body}, sans-serif`, fontSize: l.size, fontWeight: l.weight, color: l.color, textAlign: l.align, lineHeight: 1.18, whiteSpace: "pre-wrap", wordBreak: "normal", overflowWrap: "normal", hyphens: "none" }}>{l.text}</div>
  </foreignObject>;
  if (l.type === "image") {
    const src = resolveSrc(l.src);
    if (!src) return <rect x={l.x} y={l.y} width={l.w} height={l.h} fill="#94a3b8" opacity={0.3} />;
    return <foreignObject x={l.x} y={l.y} width={l.w} height={l.h}><div style={{ width: "100%", height: "100%", overflow: "hidden" }}>
      <img src={src} alt="" crossOrigin="anonymous" style={{ width: "100%", height: "100%", objectFit: l.fit, objectPosition: `${50 + l.crop.x}% ${50 + l.crop.y}%`, transform: `scale(${l.crop.zoom})` }} /></div></foreignObject>;
  }
  if (l.type === "icon") { const I = ICON_CMP[l.icon] ?? Lightbulb; return <foreignObject x={l.x} y={l.y} width={l.w} height={l.h}><I style={{ width: "100%", height: "100%", color: l.color }} /></foreignObject>; }
  return <Chart l={l} kit={kit} />;
}

/** Interactive SVG canvas: select, drag (with grid/safe-margin snapping), resize from the corner handle. */
export function DesignCanvas({ doc, page, kit, selected, onSelect, onChange, onCommit, grid, guides }: {
  doc: DesignDoc; page: Page; kit: BrandKit; selected: string | null; grid: boolean; guides: boolean;
  onSelect: (id: string | null) => void; onChange: (layers: Layer[]) => void; onCommit: () => void;
}) {
  const { w, h } = DESIGN_FORMATS[doc.format], m = safeMargin(doc.format);
  const ref = useRef<SVGSVGElement>(null);
  const drag = useRef<{ id: string; mode: "move" | "size"; sx: number; sy: number; o: Layer } | null>(null);
  const [, force] = useState(0);
  const pt = (e: React.PointerEvent | PointerEvent) => { const r = ref.current!.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * w, y: ((e.clientY - r.top) / r.height) * h }; };
  const snap = (v: number, targets: number[]) => { for (const t of targets) if (Math.abs(v - t) < 12) return t; return grid ? Math.round(v / 20) * 20 : Math.round(v); };
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = drag.current; if (!d) return;
      const p = pt(e), dx = p.x - d.sx, dy = p.y - d.sy, o = d.o;
      const next = d.mode === "move"
        ? { ...o, x: snap(o.x + dx, [m, w - m - o.w, (w - o.w) / 2]), y: snap(o.y + dy, [m, h - m - o.h, (h - o.h) / 2]) }
        : { ...o, w: Math.max(20, snap(o.w + dx, [w - m - o.x])), h: Math.max(10, snap(o.h + dy, [h - m - o.y])) };
      onChange(page.layers.map((l) => (l.id === d.id ? (next as Layer) : l))); force((x) => x + 1);
    };
    const up = () => { if (drag.current) { drag.current = null; onCommit(); } };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  });
  const sel = page.layers.find((l) => l.id === selected);
  return (
    <svg ref={ref} viewBox={`0 0 ${w} ${h}`} className="h-auto w-full touch-none select-none rounded-md border border-border shadow-sm" onPointerDown={(e) => { if (e.target === ref.current || (e.target as any).dataset?.bg) onSelect(null); }}>
      <rect data-bg="1" x={0} y={0} width={w} height={h} fill={page.background} />
      {grid && guides && Array.from({ length: Math.floor(w / 60) }, (_, i) => <line key={`gx${i}`} x1={(i + 1) * 60} y1={0} x2={(i + 1) * 60} y2={h} stroke="#94a3b8" strokeOpacity={0.15} pointerEvents="none" />)}
      {page.layers.map((l) => <g key={l.id} style={{ cursor: l.locked ? "default" : "move" }} onPointerDown={(e) => { e.stopPropagation(); onSelect(l.id); if (!l.locked) { const p = pt(e); drag.current = { id: l.id, mode: "move", sx: p.x, sy: p.y, o: l }; } }}>
        <LayerView l={l} kit={kit} />
        {!l.hidden && <rect x={l.x} y={l.y} width={l.w} height={l.h} fill="transparent" />}
      </g>)}
      {guides && <rect x={m} y={m} width={w - 2 * m} height={h - 2 * m} fill="none" stroke="#5dc6d1" strokeDasharray="12 10" strokeWidth={2} pointerEvents="none" />}
      {guides && sel && !sel.hidden && <g>
        <rect x={sel.x} y={sel.y} width={sel.w} height={sel.h} fill="none" stroke={sel.locked ? "#f59e0b" : "#3b82f6"} strokeWidth={3} pointerEvents="none" />
        {!sel.locked && <rect x={sel.x + sel.w - 14} y={sel.y + sel.h - 14} width={28} height={28} fill="#3b82f6" style={{ cursor: "nwse-resize" }}
          onPointerDown={(e) => { e.stopPropagation(); const p = pt(e); drag.current = { id: sel.id, mode: "size", sx: p.x, sy: p.y, o: sel }; }} />}
      </g>}
    </svg>
  );
}
