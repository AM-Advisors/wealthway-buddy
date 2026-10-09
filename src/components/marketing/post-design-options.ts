export type PostSlide = { title: string; text: string };

/** The chosen total includes the cover and closing slide. Hidden drafts are preserved. */
export function carouselContentCount(total: number): number {
  return Math.max(3, Math.min(10, Math.round(Number.isFinite(total) ? total : 4))) - 2;
}

export function resizeCarouselDrafts(slides: PostSlide[], total: number): PostSlide[] {
  const count = carouselContentCount(total);
  return Array.from({ length: Math.max(count, slides.length) }, (_, i) => slides[i] ?? { title: "", text: "" });
}

export const POST_PALETTES = [
  { id: "navy", label: "Navy & teal", surface: "var(--brand-navy)", accent: "var(--brand-teal)", lightAccent: "var(--brand-navy)", swatch: "bg-brand-navy" },
  { id: "blue", label: "Royal blue", surface: "var(--brand-blue)", accent: "var(--brand-lightblue)", lightAccent: "var(--brand-blue)", swatch: "bg-brand-blue" },
  { id: "sky", label: "Ocean blue", surface: "var(--brand-sky)", accent: "var(--brand-teal)", lightAccent: "var(--brand-navy)", swatch: "bg-brand-sky" },
  { id: "mint", label: "Mint & navy", surface: "var(--brand-navy)", accent: "var(--brand-mint)", lightAccent: "var(--brand-navy)", swatch: "bg-brand-mint" },
  { id: "violet", label: "Violet & ice", surface: "var(--brand-violet)", accent: "var(--brand-lightblue)", lightAccent: "var(--brand-violet)", swatch: "bg-brand-violet" },
  { id: "ice", label: "Ice blue", surface: "var(--brand-deep-navy)", accent: "var(--brand-lightblue)", lightAccent: "var(--brand-navy)", swatch: "bg-brand-lightblue" },
  { id: "ink", label: "Ink & white", surface: "var(--brand-ink)", accent: "var(--brand-white)", lightAccent: "var(--brand-ink)", swatch: "bg-brand-ink" },
] as const;