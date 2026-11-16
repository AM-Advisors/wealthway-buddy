// Pure rules for the Texas Capital account package. No I/O.

export const TEXAS_CAPITAL_RECIPIENTS = [
  "Jeannie.Anguiano@texascapital.com",
  "Ginger.Lanman@texascapital.com",
  "elliott.bouillion@texascapital.com",
  "MiddleMarketClientService@texascapital.com",
] as const;
export const TEXAS_CAPITAL_CC = "operations@harmonious.co";
export const PACKET_LINK_DAYS = 14;

export type EntityKind = "llc" | "corporation";
export type PacketStatus = "draft" | "ready" | "approved" | "sent" | "opened" | "account_opened" | "cancelled";

export const STATUS_LABEL: Record<PacketStatus, string> = {
  draft: "Draft", ready: "Ready for review", approved: "Approved", sent: "Sent",
  opened: "Opened by Texas Capital", account_opened: "Account opened", cancelled: "Cancelled",
};

export type PacketDoc = { key: string; label: string; optional?: boolean };

/** Documents Texas Capital asks for, by entity type. */
export function requiredDocuments(kind: EntityKind, hasDba: boolean): PacketDoc[] {
  if (kind === "corporation") {
    return [
      { key: "incorporation_or_filing", label: "Certificate of Incorporation or Certificate of Filing" },
      { key: "bylaws", label: "Executed Bylaws" },
      { key: "ein", label: "EIN certificate, W-9 or SS-4" },
      ...(hasDba ? [{ key: "assumed_name", label: "Assumed Name Certificate and W-9 showing the DBA" }] : []),
    ];
  }
  return [
    { key: "operating_agreement", label: "Operating or Company Agreement" },
    { key: "certificate_of_formation", label: "Certificate of Formation" },
    { key: "certificate_of_filing", label: "Certificate of Filing" },
    { key: "ein", label: "EIN certificate, W-9 or SS-4" },
    ...(hasDba ? [{ key: "assumed_name", label: "Assumed Name Certificate and W-9 showing the DBA" }] : []),
  ];
}

export type PacketPerson = {
  name: string; email?: string; phone?: string; title?: string;
  roles: ("signer" | "controlling_party" | "beneficial_owner")[];
  ownershipPercent?: number | null;
  /** Already on file with Texas Capital (existing customer). */
  onFileWithBank: boolean;
};

/** ID is needed for every signer, controlling party and owner who isn't already on file with the bank. */
export function needsIdentification(p: PacketPerson): boolean {
  return p.roles.length > 0 && !p.onFileWithBank;
}

export type PacketAnswers = {
  legalName?: string; entityType?: string; ein?: string; dba?: string;
  businessPhone?: string; website?: string; naics?: string; narrative?: string;
  dateEstablished?: string; stateOfIncorporation?: string; registeredInTexas?: boolean | null;
  physicalAddress?: string; mailingAddress?: string; primaryContactEmail?: string;
  accountPurpose?: string;
  accounts: { count: number; type: "checking" | "savings"; addToBankNow: boolean };
  people: PacketPerson[];
};

export const DEFAULT_ACCOUNTS = { count: 1, type: "checking", addToBankNow: true } as const;

const REQUIRED_FIELDS: [keyof PacketAnswers, string][] = [
  ["legalName", "Legal name"], ["entityType", "Entity type"], ["ein", "Tax ID (EIN)"],
  ["physicalAddress", "Physical address"], ["stateOfIncorporation", "State of formation"],
  ["dateEstablished", "Date established"], ["narrative", "What the business does"],
  ["primaryContactEmail", "Primary contact email"],
];

/** What is still blank before the package can go for review. */
export function missingForReview(a: PacketAnswers, docs: Record<string, boolean>, kind: EntityKind): string[] {
  const out: string[] = [];
  for (const [k, label] of REQUIRED_FIELDS) {
    const v = a[k];
    if (typeof v !== "string" || !v.trim()) out.push(label);
  }
  if (a.physicalAddress && /\bp\.?\s*o\.?\s*box\b/i.test(a.physicalAddress)) out.push("Physical address can't be a PO Box");
  if (!a.people.some((p) => p.roles.includes("signer"))) out.push("At least one signer");
  if (!a.people.some((p) => p.roles.includes("controlling_party"))) out.push("A controlling party");
  if (!Number.isInteger(a.accounts.count) || a.accounts.count < 1 || a.accounts.count > 20) out.push("Number of accounts");
  for (const d of requiredDocuments(kind, !!a.dba?.trim())) if (!docs[d.key]) out.push(d.label);
  return out;
}

/** Any authorized approver may approve, never the person who prepared it. */
export function approvalBlocker(input: { status: PacketStatus; preparedBy: string | null; approverId: string; authorized: boolean }): string | null {
  if (!input.authorized) return "You can't approve packages for this fund.";
  if (input.status !== "ready") return "Only a package that's ready for review can be approved.";
  if (input.preparedBy && input.preparedBy === input.approverId) return "Someone other than the preparer has to approve this package.";
  return null;
}

/** Undo is allowed only before sending. */
export function canUndoApproval(status: PacketStatus): boolean {
  return status === "approved";
}

export function linkExpiry(from: Date): Date {
  return new Date(from.getTime() + PACKET_LINK_DAYS * 86_400_000);
}

export function linkUsable(p: { expiresAt: string | null; revokedAt: string | null; status: PacketStatus }, now: Date): boolean {
  if (!p.expiresAt || p.revokedAt) return false;
  if (!["sent", "opened", "account_opened"].includes(p.status)) return false;
  return new Date(p.expiresAt).getTime() > now.getTime();
}

/** Entity type text on the bank form from the platform's entity type. */
export function entityKindFrom(entityType: string | null | undefined): EntityKind {
  return /corp|inc/i.test(entityType ?? "") ? "corporation" : "llc";
}

export function formatEin(v: string | null | undefined): string {
  const d = (v ?? "").replace(/\D/g, "");
  return d.length === 9 ? `${d.slice(0, 2)}-${d.slice(2)}` : (v ?? "").trim();
}
