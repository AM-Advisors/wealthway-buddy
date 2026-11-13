/**
 * Finds template blanks ({{ }}) left in a fund document before it is approved.
 * Subscription agreements keep investor and signing fields, which are filled per
 * investor or by the signing step itself, so those are not treated as leftovers.
 */
const SIGNING_TIME = new Set([
  "date", "signature", "signatorylegalname", "signatorytitle", "subscriptionamount",
  "investorsubscriptionamount", "subscriberlegalname", "investorsignername", "investorsignertitle",
  "taxclassification", "irsform", "subscribertaxform", "subscribertype",
]);
const norm = (k: string) => k.toLowerCase().replace(/[’']s\b/g, "").replace(/[^a-z0-9]/g, "");

export function leftoverBlanks(text: string, category: string | null | undefined): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(/\{\{([^{}]{0,80})\}\}/g)) {
    const name = (m[1] ?? "").trim();
    if (category === "subscription_agreement" && SIGNING_TIME.has(norm(name))) continue;
    found.add(name ? `{{${name}}}` : "an empty {{ }}");
  }
  return [...found];
}

export function leftoverBlanksError(blanks: string[]): string | null {
  return blanks.length ? `This document still has blanks to fill in: ${blanks.slice(0, 8).join(", ")}. Upload a corrected version first.` : null;
}

/** Text of a Word file's body, headers and footers; other file types return null (not checked). */
export async function docxText(bytes: Uint8Array): Promise<string | null> {
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) return null;
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(bytes);
  const parts: string[] = [];
  for (const name of Object.keys(zip.files).filter((n) => /^word\/(document|header\d*|footer\d*|footnotes)\.xml$/.test(n))) {
    const xml = (await zip.file(name)?.async("string")) ?? "";
    parts.push(xml.replace(/<w:p[ >]/g, "\n$&").replace(/<[^>]+>/g, "").replace(/&apos;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&"));
  }
  return parts.join("\n");
}

/** True when a subscription-agreement blank is filled per investor or at signing, not from fund setup. */
export function isSigningTimeBlank(name: string, category: string | null | undefined) {
  return category === "subscription_agreement" && SIGNING_TIME.has(norm(name.replace(/^\{\{|\}\}$/g, "")));
}

/** Every {{ }} blank a Word template contains; an empty {{}} is named from the label before it (e.g. "Tel:"). */
export async function templatePlaceholders(bytes: Uint8Array): Promise<string[]> {
  const text = await docxText(bytes);
  if (!text) return [];
  const { unlabeledField } = await import("@/lib/docx-autofill");
  const found = new Set<string>();
  for (const m of text.matchAll(/\{\{([^{}]{0,80})\}\}/g)) {
    const name = (m[1] ?? "").trim();
    found.add(name || unlabeledField(text.slice(0, m.index ?? 0)));
  }
  return [...found];
}
