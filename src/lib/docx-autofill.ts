/**
 * Fills {{Placeholder}} fields in a .docx with fund details. Word often splits a
 * placeholder across several text runs, so matching runs over each paragraph's
 * joined text and writes the value into the first run. Unknown placeholders and
 * fields with no value are left exactly as written for a person to complete.
 */
import JSZip from "jszip";

export const normKey = (k: string) => k.toLowerCase().replace(/[’']s\b/g, "").replace(/[^a-z0-9]/g, "");

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const unesc = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d))).replace(/&amp;/g, "&");

export function fillXml(xml: string, values: Record<string, string>, seen: { filled: Set<string>; open: Set<string> }) {
  return xml.replace(/<w:p[ >][\s\S]*?<\/w:p>/g, (para) => {
    const nodes: { start: number; end: number; text: string }[] = [];
    const re = /(<w:t(?:\s[^>]*)?>)([\s\S]*?)(<\/w:t>)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(para))) nodes.push({ start: m.index + m[1]!.length, end: m.index + m[1]!.length + m[2]!.length, text: unesc(m[2]!) });
    const joined = nodes.map((n) => n.text).join("");
    if (!joined.includes("{{")) return para;
    const texts = nodes.map((n) => n.text);
    const offsets: number[] = []; let o = 0; for (const t of texts) { offsets.push(o); o += t.length; }
    const at = (pos: number) => { let i = offsets.length - 1; while (i > 0 && offsets[i]! > pos) i--; return i; };
    const tokens = [...joined.matchAll(/\{\{([^{}]{1,80})\}\}/g)].reverse();
    let changed = false;
    for (const t of tokens) {
      const key = normKey(t[1]!);
      const v = values[key];
      if (!v) { seen.open.add(t[1]!.trim()); continue; }
      seen.filled.add(t[1]!.trim());
      const s = t.index!, e = s + t[0].length;
      const a = at(s), b = at(e - 1);
      for (let i = a; i <= b; i++) {
        const ns = offsets[i]!, txt = texts[i]!;
        const from = Math.max(0, s - ns), to = Math.min(txt.length, e - ns);
        texts[i] = txt.slice(0, from) + (i === a ? v : "") + txt.slice(to);
      }
      changed = true;
    }
    if (!changed) return para;
    let out = ""; let last = 0;
    nodes.forEach((n, i) => { out += para.slice(last, n.start) + esc(texts[i]!); last = n.end; });
    out += para.slice(last);
    return out.replace(/<w:t>([^<]*(?:^\s|\s$)[^<]*)<\/w:t>/g, '<w:t xml:space="preserve">$1</w:t>');
  });
}

export async function fillDocx(bytes: Uint8Array, raw: Record<string, string | null | undefined>) {
  const values: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) if (v != null && String(v).trim()) values[normKey(k)] = String(v).trim();
  const zip = await JSZip.loadAsync(bytes);
  const seen = { filled: new Set<string>(), open: new Set<string>() };
  for (const name of Object.keys(zip.files).filter((n) => /^word\/(document|header\d*|footer\d*|footnotes)\.xml$/.test(n))) {
    const xml = await zip.file(name)!.async("string");
    zip.file(name, fillXml(xml, values, seen));
  }
  const out = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  return { bytes: out, filled: [...seen.filled], open: [...seen.open].filter((k) => !seen.filled.has(k)) };
}
