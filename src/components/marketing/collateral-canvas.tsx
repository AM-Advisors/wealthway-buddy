/** Fixed-brand collateral pages rendered at export size (1600x2000; social 1600x1600). Colors come from BRAND, not theme tokens, because exports must look identical everywhere. */
import { forwardRef } from "react";
import logo from "@/assets/logo-white.png.asset.json";
import { BRAND } from "@/lib/marketing-brand";
import { regLabel, structureLabel, type CollateralContent } from "@/lib/collateral-templates";

const H = { fontFamily: "Rubik, sans-serif", fontWeight: 700 } as const;
const B = { fontFamily: "Poppins, sans-serif" } as const;
const wrap = { hyphens: "none", overflowWrap: "normal", wordBreak: "keep-all" } as const;
const card = { background: "#fff", border: `1px solid ${BRAND.slate}`, borderRadius: 18, color: "#1e293b" } as const;
const eyebrow = { ...B, color: BRAND.cyan, fontSize: 18, letterSpacing: 1.5, textTransform: "uppercase" } as const;

function Shell({ children, height = 2000, page, c }: { children: React.ReactNode; height?: number; page?: string; c: CollateralContent }) {
  return (
    <div data-collateral-page style={{ ...B, ...wrap, width: 1600, height, position: "relative", overflow: "hidden", color: "#fff",
      background: `radial-gradient(circle at 92% 4%, rgba(93,198,209,0.18), transparent 32%), linear-gradient(180deg, ${BRAND.navy} 0%, ${BRAND.midnight} 100%)`, padding: 80, boxSizing: "border-box", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <div style={eyebrow}>{c.eyebrow}</div>{page && <div style={eyebrow}>{page}</div>}
      </div>
      {children}
      {c.showFooter && (
        <div style={{ marginTop: "auto", borderTop: `2px solid ${BRAND.cyan}`, paddingTop: 24, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div><div style={{ fontSize: 24 }}>{BRAND.proof}</div><div style={{ fontSize: 18, opacity: 0.7 }}>harmonious.co · Direct access to dedicated fund accounting specialists</div></div>
          <img src={logo.url} alt="Harmonious" crossOrigin="anonymous" style={{ height: 56 }} />
        </div>
      )}
    </div>
  );
}

const Title = ({ t, s }: { t: string; s: string }) => (
  <div style={{ marginTop: 12, paddingBottom: 20, borderBottom: `2px solid ${BRAND.cyan}`, marginBottom: 28 }}>
    <div style={{ ...H, fontSize: 52, lineHeight: 1.1 }}>{t}</div><div style={{ fontSize: 26, marginTop: 10, opacity: 0.9 }}>{s}</div>
  </div>
);

export const CollateralPages = forwardRef<HTMLDivElement, { c: CollateralContent; social?: boolean }>(function CollateralPages({ c, social }, ref) {
  const services = c.services.filter((s) => s.on).slice(0, 6);
  if (social) return (
    <div ref={ref}>
      <Shell c={c} height={1600}>
        <div style={{ marginTop: 120 }}>
          <div style={{ ...H, fontSize: 84, lineHeight: 1.05 }}>{c.title}</div>
          <div style={{ fontSize: 34, marginTop: 24, opacity: 0.9, maxWidth: 1200 }}>{c.hookLead}</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 24, marginTop: 80 }}>
          {c.pillars.map((p) => <div key={p.title} style={{ ...card, padding: 32 }}><div style={{ ...H, fontSize: 28, color: BRAND.navy }}>{p.title}</div><div style={{ fontSize: 20, marginTop: 10 }}>{p.body}</div></div>)}
        </div>
      </Shell>
    </div>
  );
  return (
    <div ref={ref} style={{ display: "flex", flexDirection: "column", gap: 40 }}>
      <Shell c={c} page="Page 1 of 2">
        <Title t={c.title} s={c.subtitle} />
        <div style={{ ...card, padding: 36 }}>
          <div style={eyebrow}>The executive view</div>
          <div style={{ ...H, fontWeight: 500, fontSize: 30, marginTop: 8, color: BRAND.navy }}>{c.hookLead}</div>
          <div style={{ fontSize: 21, lineHeight: 1.6, marginTop: 16 }}>{c.hook}</div>
          <div style={{ fontSize: 19, marginTop: 14, color: BRAND.navy }}>{structureLabel(c)} · {regLabel(c)}</div>
        </div>
        <div style={{ ...card, padding: 36, marginTop: 28 }}>
          <div style={eyebrow}>End-to-end capital flow & lifecycle architecture</div>
          {c.tiers.map((t, i) => (
            <div key={t.label}>
              <div style={{ marginTop: 18, padding: 24, borderRadius: 14, border: `${i === 1 ? 2 : 1}px solid ${i === 1 ? BRAND.cyan : BRAND.slate}`, background: i === 1 ? "#eff8ff" : "#f8fafc" }}>
                <div style={{ ...eyebrow, fontSize: 16 }}>{t.label}</div>
                <div style={{ ...H, fontWeight: 500, fontSize: 26, marginTop: 6, color: BRAND.navy }}>{t.title}</div>
                <div style={{ fontSize: 19, marginTop: 8, display: "flex", flexWrap: "wrap", gap: "4px 28px" }}>{t.points.map((p) => <span key={p}>• {p}</span>)}</div>
              </div>
              {c.flows[i] && i < c.tiers.length - 1 && <div style={{ textAlign: "center", fontSize: 18, fontWeight: 600, color: "#475569", marginTop: 14 }}><span style={{ color: BRAND.cyan }}>▼</span> {c.flows[i]}</div>}
            </div>
          ))}
        </div>
        <div style={{ ...card, padding: 36, marginTop: 28 }}>
          <div style={eyebrow}>Why leading managers choose Harmonious</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 28, marginTop: 14 }}>
            {c.pillars.map((p) => <div key={p.title}><div style={{ ...H, fontWeight: 500, fontSize: 24, color: BRAND.navy }}>{p.title}</div><div style={{ fontSize: 18, marginTop: 8, lineHeight: 1.5 }}>{p.body}</div></div>)}
          </div>
        </div>
      </Shell>
      <Shell c={c} page="Page 2 of 2">
        <Title t="Core Services Matrix & Platform Technology" s="Complete full-lifecycle administration from initial formation to final distribution." />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
          {services.map((s, i) => (
            <div key={s.title} style={{ ...card, padding: 28 }}>
              <div style={{ ...eyebrow, fontSize: 16 }}>{i + 1}. {s.title}</div>
              <div style={{ ...H, fontWeight: 500, fontSize: 24, marginTop: 6, color: BRAND.navy, paddingBottom: 12, borderBottom: `1px solid ${BRAND.slate}` }}>{s.subtitle}</div>
              <div style={{ fontSize: 18, marginTop: 12, lineHeight: 1.7 }}>{s.points.map((p) => <div key={p}>• {p}</div>)}</div>
            </div>
          ))}
        </div>
        <div style={{ ...card, padding: 36, marginTop: 28 }}>
          <div style={eyebrow}>Proprietary technology platform & dedicated support</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginTop: 16 }}>
            {[["Harmonious platform capabilities", c.platform], ["Dedicated operations specialists", c.specialists]].map(([h, list]) => (
              <div key={h as string} style={{ background: "#f8fafc", border: `1px solid ${BRAND.slate}`, borderRadius: 14, padding: 24 }}>
                <div style={{ ...H, fontWeight: 500, fontSize: 20, color: BRAND.navy, textTransform: "uppercase" }}>{h as string}</div>
                <div style={{ fontSize: 18, marginTop: 10, lineHeight: 1.6 }}>{(list as string[]).map((p) => <div key={p}>• {p}</div>)}</div>
              </div>
            ))}
          </div>
        </div>
      </Shell>
    </div>
  );
});

/** Flags elements whose text overflows their box (a broken or clipped line). */
export function overflowProblems(root: HTMLElement | null): string[] {
  if (!root) return [];
  const out: string[] = [];
  root.querySelectorAll<HTMLElement>("div, span").forEach((el) => {
    if (el.children.length === 0 && el.scrollWidth > el.clientWidth + 1) out.push(`Text doesn't fit: "${(el.textContent ?? "").slice(0, 60)}"`);
  });
  root.querySelectorAll<HTMLElement>("[data-collateral-page]").forEach((p, i) => {
    if (p.scrollHeight > p.clientHeight + 1) out.push(`Page ${i + 1} has too much content. Shorten or turn off a service.`);
  });
  return out;
}
