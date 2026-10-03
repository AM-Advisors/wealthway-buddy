/** Marketing AI helpers (copy + images) through the Lovable AI gateway. Server-only. */
const URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const RESPONSES_URL = "https://ai.gateway.lovable.dev/v1/responses";
const TEXT_MODEL = "openai/gpt-6-astra";
const IMAGE_MODEL = "google/gemini-3.1-flash-image";

const VOICE = "You write for Harmonious (harmonious.co), a fund administration and back-office platform for venture funds, SPVs and their investors. Voice: clear, confident, warm, professional; no hype, no emojis unless asked, no guaranteed returns or investment advice, no specific performance claims. Never invent facts, clients, numbers or quotes.";

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
      messages: [{ role: "user", content: `Create a polished social media graphic for Harmonious, a fund administration company. Brand colors navy #142647, teal #5DC6D1, white. Clean, modern, professional, no text unless asked. ${prompt}` }],
    }),
  });
  await check(res);
  const j: any = await res.json();
  const url: string | undefined = j?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  const m = url?.match(/^data:(image\/[\w+]+);base64,(.+)$/);
  if (!m) throw new Error("The AI helper didn't return an image.");
  return { contentType: m[1]!, base64: m[2]! };
}
