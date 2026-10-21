/** Fail closed rather than projecting a failed source as an empty history. */
export function assertDiagnosticReads(results: readonly { error?: unknown }[]) {
  if (results.some(result => result.error)) throw new Error("These records could not be loaded. Please retry.");
}
export function webhookProcessingState(input: { processedAt?: string | null; error?: unknown; status?: string | null }) {
  if (input.error || /fail|error|reject|dead/i.test(input.status ?? "")) return "Processing failed";
  if (!input.processedAt) return "Received — processing unconfirmed";
  if (/skip|ignore|unhandled|no.match/i.test(input.status ?? "")) return "Processed — no change applied";
  return "Successfully processed";
}