import { z } from "zod";

/** Adopted e-signature image (PNG data URL, ≤ 300 KB) and how it was made. */
export const adoptedSignatureSchema = z.object({
  method: z.enum(["typed", "drawn", "uploaded"]),
  image: z
    .string()
    .max(400_000)
    .regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/, "Signature must be a PNG image."),
});
export type AdoptedSignatureInput = z.infer<typeof adoptedSignatureSchema>;

export function pngBytesFromDataUrl(dataUrl: string): Uint8Array {
  const b64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
