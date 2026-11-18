/** Server-only: loads the emails and invitation-link opens tied to a person's emails and investments. Callers authorize first. */
import { outsideAccountEvents, type TimelineRow } from "@/lib/person-activity-timeline";

export async function loadOutsideAccountEvents(db: any, d: { emails: string[]; onboardingIds: string[]; from?: string | undefined; to?: string | undefined; before?: string | undefined }): Promise<TimelineRow[]> {
  const emails = [...new Set(d.emails.filter(Boolean).flatMap((e) => [e, e.toLowerCase(), e.trim().toLowerCase()]))];
  const ids = [...new Set(d.onboardingIds.filter(Boolean))];
  const none = Promise.resolve({ data: [] as any[] });
  const range = (q: any, col: string) => {
    if (d.before) q = q.lt(col, d.before);
    if (d.from) q = q.gte(col, d.from);
    if (d.to) q = q.lte(col, d.to);
    return q.order(col, { ascending: false }).limit(100);
  };
  const [sendsByOb, sendsByEmail, opens, clicks, linkOpens] = await Promise.all([
    ids.length ? range(db.from("investor_email_sends").select("id, kind, subject, sent_at, created_at").in("onboarding_id", ids).eq("outcome", "sent"), "created_at") : none,
    emails.length ? range(db.from("investor_emails").select("id, subject, created_at").in("to_email", emails).neq("status", "failed"), "created_at") : none,
    emails.length ? range(db.from("email_opens").select("id, template, opened_at").in("recipient", emails), "opened_at") : none,
    emails.length ? range(db.from("email_link_clicks").select("id, template, link_label, clicked_at").in("recipient", emails), "clicked_at") : none,
    ids.length ? range(db.from("investor_onboarding_events").select("id, created_at").in("onboarding_id", ids).eq("event", "invitation_link_opened"), "created_at") : none,
  ]);
  return outsideAccountEvents({
    sends: [
      ...((sendsByOb.data ?? []) as any[]).map((x) => ({ id: x.id, subject: x.subject, kind: x.kind, at: x.sent_at ?? x.created_at })),
      ...((sendsByEmail.data ?? []) as any[]).map((x) => ({ id: x.id, subject: x.subject, at: x.created_at })),
    ],
    opens: ((opens.data ?? []) as any[]).map((x) => ({ id: x.id, template: x.template, at: x.opened_at })),
    clicks: ((clicks.data ?? []) as any[]).map((x) => ({ id: x.id, template: x.template, link_label: x.link_label, at: x.clicked_at })),
    linkOpens: ((linkOpens.data ?? []) as any[]).map((x) => ({ id: x.id, at: x.created_at })),
  });
}
