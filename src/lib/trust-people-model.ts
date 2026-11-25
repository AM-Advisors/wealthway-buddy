/** One row per person on a trust/company investment, merged from the parties reader and the (staff/manager-only) identity reader. Pure. */
export type PartyRow = {
  personId: string; name: string; roles: string[]; ownershipPercent: number | null; signer: boolean; w9Signer?: boolean;
  email: string | null; login: string; accessLabel: string; kyc: string; aml: string; ssnOnFile: boolean; idCards: number | boolean;
  documents: { title: string; status: string }[]; activity: { at: string; text: string }[]; nextAction?: string | null;
};
export type IdentityRow = { personId: string; ssnLast4: string | null; cards: unknown[] };
export type TrustPerson = PartyRow & { ssnLast4: string | null; ssnLabel: string; idCardCount: number; hasIdentity: boolean };

export function ssnLabel(onFile: boolean, last4: string | null): string {
  if (last4) return `On file, ending ${last4}`;
  return onFile ? "On file" : "Needed";
}

export function mergeTrustPeople(parties: PartyRow[], identity: IdentityRow[] | null): TrustPerson[] {
  const byId = new Map((identity ?? []).map((i) => [i.personId, i]));
  return parties.map((p) => {
    const id = byId.get(p.personId);
    const last4 = id?.ssnLast4 ?? null;
    const onFile = p.ssnOnFile || Boolean(last4);
    const idCardCount = id ? id.cards.length : typeof p.idCards === "number" ? p.idCards : p.idCards ? 1 : 0;
    return { ...p, ssnOnFile: onFile, ssnLast4: last4, ssnLabel: ssnLabel(onFile, last4), idCardCount, hasIdentity: Boolean(id) };
  });
}
