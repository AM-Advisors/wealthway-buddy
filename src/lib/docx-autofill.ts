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

// Explicit publisher identity blanks only; never replace optional clauses,
// negotiated economics, investor details, dates or hard-coded jurisdictions.
const publisherFields: Record<string, string> = {
  nameoffund: "Fund Legal Name",
  nameofgeneralpartner: "General Partner Name",
  nameoffundmanager: "Fund Manager Name",
};

/** Names an empty {{}} blank from the label immediately before it. */
export function unlabeledField(before: string) {
  const tail = before.slice(-40);
  if (/(?:tel|telephone|phone|ph)\.?\s*:?\s*$/i.test(tail)) return "Manager Phone";
  if (/e-?mail\s*:?\s*$/i.test(tail)) return "Manager Email";
  if (/(?:fax)\s*:?\s*$/i.test(tail)) return "Manager Fax";
  return "Unlabeled blank";
}

/** Flag fixed clauses that disagree with recorded facts; never rewrite legal clauses. */
export function templateTermConflicts(text: string, raw: Record<string, string | null | undefined>) {
  const values = Object.fromEntries(Object.entries(raw).map(([key, value]) => [normKey(key), value]));
  const conflicts: string[] = [];
  const fee = values["managementfee"];
  if (fee && Number(fee.replace(/%/g, "")) > 0 && /(?:Manager will not receive|Adviser will not collect) a management fee/i.test(text)) {
    conflicts.push("Review: fixed no-management-fee clause conflicts with the recorded management fee");
  }
  const city = values["arbitrationcity"];
  const state = values["arbitrationstate"];
  const fixedLocation = text.match(/[“"]Arbitration Location[”"]\s+means\s+([^.,\n]+),\s*([^\.\n]+)\./i);
  if (fixedLocation && city && state && (normKey(fixedLocation[1] ?? "") !== normKey(city) || normKey(fixedLocation[2] ?? "") !== normKey(state))) {
    conflicts.push("Review: fixed arbitration location conflicts with the recorded arbitration city and state");
  }
  return conflicts;
}

export function fillXml(xml: string, values: Record<string, string>, seen: { filled: Set<string>; open: Set<string> }) {
  return xml.replace(/<w:p[ >][\s\S]*?<\/w:p>/g, (para) => {
    const nodes: { start: number; end: number; text: string }[] = [];
    const re = /(<w:t(?:\s[^>]*)?>)([\s\S]*?)(<\/w:t>)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(para))) {
      const opening = m[1]; const content = m[2];
      if (opening == null || content == null) continue;
      nodes.push({ start: m.index + opening.length, end: m.index + opening.length + content.length, text: unesc(content) });
    }
    const joined = nodes.map((n) => n.text).join("");
    if (!joined.includes("{{") && !joined.includes("[")) return para;
    const texts = nodes.map((n) => n.text);
    const offsets: number[] = []; let o = 0; for (const t of texts) { offsets.push(o); o += t.length; }
    const at = (pos: number) => { let i = offsets.length - 1; while (i > 0 && (offsets[i] ?? 0) > pos) i--; return i; };
    const tokens = [...joined.matchAll(/\{\{([^{}]{0,80})\}\}|\[([^\[\]]{1,80})\]/g)].reverse();
    let changed = false;
    for (const t of tokens) {
      let label = t[1] ?? t[2];
      // Empty {{}} blanks take their meaning from the label just before them
      // ("Tel:", "e-mail:"); anything else is reported so it is never missed.
      if (t[1] != null && !t[1].trim()) label = unlabeledField(joined.slice(0, t.index));
      if (!label) continue;
      const publisherKey = t[2] ? publisherFields[normKey(label)] : undefined;
      if (t[2] && !publisherKey) { seen.open.add(label.trim()); continue; }
      const key = normKey(publisherKey ?? label);
      const rawValue = values[key];
      // Legal templates sometimes supply the word "percent" after the blank.
      // Keep the stored percentage unchanged, but do not render "6% percent".
      const after = joined.slice(t.index + t[0].length);
      const v = rawValue?.endsWith("%") && /^\s*(?:percent\b|%)/i.test(after) ? rawValue.slice(0, -1) : rawValue;
      if (!v) { seen.open.add(label.trim()); continue; }
      seen.filled.add(label.trim());
      const s = t.index, e = s + t[0].length;
      const a = at(s), b = at(e - 1);
      for (let i = a; i <= b; i++) {
        const ns = offsets[i] ?? 0, txt = texts[i] ?? "";
        const from = Math.max(0, s - ns), to = Math.min(txt.length, e - ns);
        texts[i] = txt.slice(0, from) + (i === a ? v : "") + txt.slice(to);
      }
      changed = true;
    }
    if (!changed) return para;
    let out = ""; let last = 0;
    nodes.forEach((n, i) => { out += para.slice(last, n.start) + esc(texts[i] ?? ""); last = n.end; });
    out += para.slice(last);
    return out.replace(/<w:t>([^<]*(?:^\s|\s$)[^<]*)<\/w:t>/g, '<w:t xml:space="preserve">$1</w:t>');
  });
}

export async function fillDocx(bytes: Uint8Array, raw: Record<string, string | null | undefined>) {
  const values: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) if (v != null && String(v).trim()) values[normKey(k)] = String(v).trim();
  const zip = await JSZip.loadAsync(bytes);
  const seen = { filled: new Set<string>(), open: new Set<string>() };
  const conflicts = new Set<string>();
  for (const name of Object.keys(zip.files).filter((n) => /^word\/(document|header\d*|footer\d*|footnotes)\.xml$/.test(n))) {
    const file = zip.file(name);
    if (!file) continue;
    const xml = await file.async("string");
    const text = [...xml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)].map(([para]) => [...para.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((m) => unesc(m[1] ?? "")).join("")).join("\n");
    for (const conflict of templateTermConflicts(text, raw)) conflicts.add(conflict);
    zip.file(name, fillXml(xml, values, seen));
  }
  const out = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  return { bytes: out, filled: [...seen.filled], open: [...seen.open].filter((k) => !seen.filled.has(k)).concat([...conflicts]) };
}
