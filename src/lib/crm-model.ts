/**
 * Phase 7 - contacts, deals, campaigns and messaging (pure rules).
 *
 * Visibility:
 *  - Super Administrator sees everything.
 *  - A person granted administration.crm.view_all sees everything.
 *  - Harmonious Sales sees the Harmonious contacts/deals/campaigns they own.
 *  - Fund managers see only the contacts/deals/campaigns of Funds they manage.
 * Campaigns: draft → submitted → approved (by someone else with
 * administration.campaigns.approve, or a Super Administrator) → explicit send.
 * Only opted-in, not-unsubscribed contacts with an email are ever emailed.
 */

export const DEAL_STAGES = ["lead", "contacted", "meeting", "proposal", "committed", "won", "lost"] as const;
export type DealStage = (typeof DEAL_STAGES)[number];
export const DEAL_STAGE_LABELS: Record<DealStage, string> = {
  lead: "Lead", contacted: "Contacted", meeting: "Meeting", proposal: "Proposal", committed: "Committed", won: "Won", lost: "Lost",
};

export type Scope = "harmonious" | "fund";
export type CrmActor = {
  userId: string;
  superUser: boolean;
  viewAll: boolean;
  canAssign: boolean;
  canApproveCampaigns: boolean;
  harmoniousStaff: boolean;
  managedFunds: ReadonlySet<string>;
};
export type Owned = { scope: Scope; offering_id: string | null; owner_user_id: string };

export function canSee(a: CrmActor, r: Owned): boolean {
  if (a.superUser || a.viewAll) return true;
  if (r.scope === "harmonious") return a.harmoniousStaff && r.owner_user_id === a.userId;
  return r.offering_id !== null && a.managedFunds.has(r.offering_id);
}

/** Who may create a record in a scope. */
export function canCreate(a: CrmActor, scope: Scope, offeringId: string | null): boolean {
  if (scope === "harmonious") return a.superUser || a.harmoniousStaff;
  return offeringId !== null && (a.superUser || a.managedFunds.has(offeringId));
}

export const canEdit = canSee;

export function canReassign(a: CrmActor): boolean {
  return a.superUser || a.canAssign;
}

export type CampaignStatus = "draft" | "submitted" | "approved" | "declined" | "sending" | "sent";

export function campaignDecisionProblem(a: CrmActor, c: { status: CampaignStatus; created_by: string }): string | null {
  if (c.status !== "submitted") return "Only a campaign waiting for approval can be decided.";
  if (!(a.superUser || a.canApproveCampaigns)) return "You are not set up to approve campaigns.";
  if (c.created_by === a.userId) return "Someone other than the author must approve this campaign.";
  return null;
}

export function campaignSendProblem(a: CrmActor, c: { status: CampaignStatus; created_by: string; decided_by: string | null }): string | null {
  if (c.status !== "approved") return "A campaign must be approved before it can be sent.";
  if (a.userId !== c.created_by && a.userId !== c.decided_by && !a.superUser) return "Only the author or the approver can send it.";
  return null;
}

export function campaignEditProblem(c: { status: CampaignStatus }): string | null {
  return c.status === "draft" || c.status === "declined" ? null : "Only a draft or declined campaign can be edited.";
}

export type Audience = { tags?: string[] | undefined; stages?: DealStage[] | undefined };
export type AudienceContact = { id: string; email: string | null; consent: string; archived_at: string | null; tags: string[]; stages: string[] };

/** Contacts a campaign may actually email, plus why the rest are left out. */
export function resolveAudience(contacts: AudienceContact[], aud: Audience) {
  const included: AudienceContact[] = [];
  const excluded = { noEmail: 0, notOptedIn: 0, unsubscribed: 0, archived: 0 };
  for (const c of contacts) {
    if (aud.tags?.length && !aud.tags.some((t) => c.tags.includes(t))) continue;
    if (aud.stages?.length && !aud.stages.some((s) => c.stages.includes(s))) continue;
    if (c.archived_at) { excluded.archived++; continue; }
    if (c.consent === "unsubscribed") { excluded.unsubscribed++; continue; }
    if (c.consent !== "opted_in") { excluded.notOptedIn++; continue; }
    if (!c.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.email)) { excluded.noEmail++; continue; }
    included.push(c);
  }
  return { included, excluded };
}

// ------------------------------------------------------------ one combined updates feed

export type UpdateKind = "fund_progress" | "investor_message" | "harmonious_message" | "deal" | "campaign" | "contact";
export type UpdateItem = { id: string; kind: UpdateKind; offeringId: string | null; fundName: string | null; headline: string; detail: string; at: string; path: string };

export function mergeUpdates(lists: UpdateItem[][], limit = 50): UpdateItem[] {
  const seen = new Set<string>();
  return lists
    .flat()
    .filter((u) => (seen.has(u.id) ? false : (seen.add(u.id), true)))
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
    .slice(0, limit);
}

export function unreadCount(items: UpdateItem[], lastReadAt: string | null): number {
  if (!lastReadAt) return items.length;
  return items.filter((u) => u.at > lastReadAt).length;
}

export const UPDATE_KIND_LABELS: Record<UpdateKind, string> = {
  fund_progress: "Fund progress",
  investor_message: "Investor message",
  harmonious_message: "From Harmonious",
  deal: "Deal",
  campaign: "Campaign",
  contact: "Contact",
};
