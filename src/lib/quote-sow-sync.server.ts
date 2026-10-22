import { sowLinesFromQuote, type SharedQuoteLine } from "./quote-sow-sync";
import { pricingText, servicesFromSow } from "./sales-documents-model";

/** One transaction replaces commercial terms and records both histories; never fallback to partial writes. */
export async function saveLinkedQuoteDraft(db: { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> }, d: {
  id: string; actorId: string; expectedAt: string; row: Record<string, unknown>;
  lines: SharedQuoteLine[]; sowPatch?: Record<string, unknown> | undefined;
}) {
  const displayLines = d.lines.map(l => ({ ...l, service_details: {
    ...(l.service_details?.scope === undefined ? {} : { scope: l.service_details.scope }),
    ...(l.service_details?.included === undefined ? {} : { included: l.service_details.included }),
    ...(l.service_details?.excluded === undefined ? {} : { excluded: l.service_details.excluded }),
  } }));
  const { data, error } = await db.rpc("save_linked_quote_draft", {
    p_quote_id: d.id, p_actor_id: d.actorId, p_expected_at: d.expectedAt,
    p_row: d.row, p_lines: d.lines, p_sow_lines: sowLinesFromQuote(d.lines),
    p_services: servicesFromSow(displayLines), p_pricing: pricingText(displayLines), p_sow_patch: d.sowPatch ?? null,
  });
  if (error || data !== d.id) throw new Error("Quote and SOW could not be saved together. Refresh and check that both are still drafts.");
}