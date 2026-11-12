/**
 * A fund's Subscription Agreement signed outside the platform counts as completed for the
 * investor only when Harmonious marked it and loaded the signed copy (outsideSubscriptionStates
 * complete). Other documents and partial records keep their platform status.
 */
export type OutsideSubscription = { marked: boolean; signedOn: string | null; copyLoaded: boolean; complete: boolean };

export function isSubscriptionDocument(doc: { document_category?: string | null; doc_type?: string | null }) {
  return doc.document_category === "subscription_agreement" || doc.doc_type === "subscription_agreement";
}

export function outsideSignedOn(doc: { document_category?: string | null; doc_type?: string | null }, state: OutsideSubscription | null | undefined): string | null {
  if (!state?.complete || !isSubscriptionDocument(doc)) return null;
  return state.signedOn ?? "";
}

export function outsideSignedLabel(signedOn: string) {
  if (!signedOn) return "Signed outside the platform";
  const d = new Date(`${signedOn}T12:00:00Z`);
  return `Signed outside the platform on ${d.toLocaleDateString("en-US", { dateStyle: "medium", timeZone: "UTC" })}`;
}
