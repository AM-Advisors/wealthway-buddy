import { COPY_RULES, IMAGE_RULES } from "@/lib/marketing-brand";
/** Marketing AI helpers (copy + images) through the Lovable AI gateway. Server-only. */
const URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const RESPONSES_URL = "https://ai.gateway.lovable.dev/v1/responses";
const TEXT_MODEL = "openai/gpt-6-astra";
const IMAGE_MODEL = "google/gemini-3.1-flash-image";

const VOICE = "You write for Harmonious (harmonious.co), a fund administration and back-office platform for venture funds, SPVs and their investors. Voice: clear, confident, warm, professional; no hype, no emojis unless asked, no guaranteed returns or investment advice, no specific performance claims. Never invent facts, clients, numbers or quotes. " + COPY_RULES;

function key() {
  const k = process.env["LOVABLE_API_KEY"];
  if (!k) throw new Error("AI isn't configured.");
  return k;
}
async function check(res: Response) {
  if (res.ok) return;
  const body = await res.text().catch(() => "");
  console.error("marketing AI failed", res.status, body);
  if (res.status === 429) throw new Error("The AI helper is busy. Try again in a minute.");
  if (res.status === 402) throw new Error("AI credits have run out. Add credits in Settings → Plans & credits.");
  throw new Error(`AI request failed [${res.status}].`);
}

export async function draftCopy(kind: "linkedin" | "facebook" | "instagram" | "email" | "subject", brief: string, current?: string | null) {
  const task = {
    linkedin: "Write one LinkedIn company post (under 1,300 characters, short paragraphs, up to 3 relevant hashtags at the end).",
    facebook: "Write one Facebook page post (under 600 characters).",
    instagram: "Write one Instagram caption (under 1,500 characters, up to 8 hashtags at the end).",
    email: "Write the body of a marketing email: plain text paragraphs separated by blank lines, no subject line, no greeting placeholders like [Name], no sign-off block (the footer is added automatically).",
    subject: "Write 5 email subject line options, one per line, each under 60 characters, no numbering.",
  }[kind];
  const res = await fetch(RESPONSES_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: TEXT_MODEL,
      reasoning: { effort: "low" },
      instructions: `${VOICE}\n${task}\nReturn only the text.`,
      input: `Brief: ${brief}${current ? `\n\nCurrent draft to improve:\n${current}` : ""}`,
    }),
  });
  await check(res);
  const j: any = await res.json();
  const text = String(j?.output_text ?? (j?.output ?? []).flatMap((o: any) => o?.content ?? []).filter((c: any) => c?.type === "output_text").map((c: any) => c.text).join("")).trim();
  if (!text) throw new Error("The AI helper returned nothing for that brief.");
  return text;
}

/** Returns base64 PNG bytes. */
export async function generateImage(prompt: string): Promise<{ base64: string; contentType: string }> {
  const res = await fetch(URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: IMAGE_MODEL,
      modalities: ["image", "text"],
      messages: [{ role: "user", content: `Create a polished social media graphic for Harmonious, a fund administration company. ${IMAGE_RULES} No text unless asked. ${prompt}` }],
    }),
  });
  await check(res);
  const j: any = await res.json();
  const url: string | undefined = j?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  const m = url?.match(/^data:(image\/[\w+]+);base64,(.+)$/);
  if (!m) throw new Error("The AI helper didn't return an image.");
  return { contentType: m[1]!, base64: m[2]! };
}

/** Collateral-style layout text for a post image: headline, subtitle, up to 3 value points. */
export type LayoutStyle = "cards" | "statement" | "stat" | "quote" | "checklist" | "photo" | "event" | "carousel";
export type LayoutSuggestion = { headline: string; subtitle: string; points: string[]; stat: string; attribution: string; cta: string; slides: { title: string; text: string }[] };
const STYLE_GUIDE: Record<LayoutStyle, string> = {
  cards: "headline at most 8 words; subtitle one sentence at most 18 words; points exactly 3 value points, at most 6 words each.",
  statement: "headline: one bold statement at most 9 words; subtitle at most 14 words; points empty.",
  stat: "stat: one short figure that appears in the post text (never invent numbers; if none, use an empty string); headline: label for it at most 8 words; subtitle at most 16 words; points empty.",
  quote: "headline: a short quote taken from or faithful to the post, at most 25 words; attribution: name and role only if the post names one, otherwise empty; points empty.",
  checklist: "headline at most 8 words; points 3 to 5 tips, at most 8 words each; subtitle optional short line.",
  photo: "headline at most 7 words; subtitle at most 16 words; points empty.",
  event: "headline: event title at most 8 words; subtitle: date and time only if in the post, else empty; cta: e.g. Register now; points empty.",
  carousel: "headline: cover title at most 8 words; subtitle: cover hook at most 12 words; slides 3 to 8 content slides each with title at most 6 words and text at most 25 words; cta: closing call-to-action at most 6 words.",
};

export async function suggestPostLayout(title: string, body: string, style: LayoutStyle = "cards"): Promise<LayoutSuggestion> {
  const str = { type: "string" };
  const res = await fetch(RESPONSES_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: TEXT_MODEL,
      reasoning: { effort: "low" },
      instructions: `${VOICE}\nTurn this social post into text for a branded graphic. ${STYLE_GUIDE[style]} Unused fields are empty strings or empty arrays. Never state facts, figures or claims the post doesn't contain. Plain text, no hashtags, no emojis.`,
      input: `Post title: ${title}\n\nPost text:\n${body.slice(0, 3000)}`,
      text: { format: { type: "json_schema", name: "post_layout", strict: true, schema: {
        type: "object", additionalProperties: false, required: ["headline", "subtitle", "points", "stat", "attribution", "cta", "slides"],
        properties: { headline: str, subtitle: str, stat: str, attribution: str, cta: str, points: { type: "array", items: str },
          slides: { type: "array", items: { type: "object", additionalProperties: false, required: ["title", "text"], properties: { title: str, text: str } } } },
      } } },
    }),
  });
  await check(res);
  const j: any = await res.json();
  const raw = String(j?.output_text ?? (j?.output ?? []).flatMap((o: any) => o?.content ?? []).filter((c: any) => c?.type === "output_text").map((c: any) => c.text).join(""));
  try {
    const o = JSON.parse(raw);
    return { headline: String(o.headline ?? ""), subtitle: String(o.subtitle ?? ""), points: (o.points ?? []).map(String).slice(0, 5),
      stat: String(o.stat ?? ""), attribution: String(o.attribution ?? ""), cta: String(o.cta ?? ""),
      slides: (o.slides ?? []).slice(0, 8).map((x: any) => ({ title: String(x?.title ?? ""), text: String(x?.text ?? "") })) };
  } catch { throw new Error("The AI helper returned nothing usable for that post."); }
}

/** Wordless background art for the brand layout. */
export function generateBackground(theme: string) {
  return generateImage(`Abstract institutional fintech background only. Absolutely no text, no letters, no numbers, no logos, no people's faces. Keep the center and lower half calm and dark so white text can sit on top. Theme: ${theme.slice(0, 400)}`);
}
