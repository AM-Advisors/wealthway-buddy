import type { ExecutionState } from "@/lib/document-signing";

/** Refresh presentation only; completion remains authoritative in the signing engine. */
export function signingRefreshInterval(input: {
  error: unknown;
  provider?: string;
  documents?: readonly { state: ExecutionState }[];
}): number | false {
  if (input.error || input.provider !== "box_sign") return false;
  return input.documents?.some((doc) => doc.state === "out_for_signature" || doc.state === "partially_signed") ? 30_000 : false;
}