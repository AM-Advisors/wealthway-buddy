export type ClientSowSection = { key: string; title: string; body: string };
const CLIENT_SECTIONS = new Set(["fund_information", "services", "pricing", "responsibilities", "terms", "msa"]);

/** Project only recorded client agreement wording, never staff notes or change requests. */
export function clientSowSections(sections: ClientSowSection[]): ClientSowSection[] {
  return sections.filter(s => CLIENT_SECTIONS.has(s.key)).map(s => ({ key: s.key, title: s.title, body: s.body }));
}

export function canReadLinkedSow(d: { version: number; tokenVersion: number; approvedVersion: number | null; status: string; accepted: boolean; clientId: string | null; sowClientId: string | null; replaced: boolean }) {
  return !d.replaced && !!d.clientId && d.clientId === d.sowClientId && d.version === d.tokenVersion && d.approvedVersion === d.tokenVersion
    && (d.accepted || ["approved", "sent", "signed"].includes(d.status));
}