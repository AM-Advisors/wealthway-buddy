/**
 * Slack alert to #operations whenever something is submitted, tagging the assigned
 * Operations person (falls back to the Account Manager). Server-only, best-effort:
 * never throws, never blocks the submission. Messages carry only the item name,
 * fund/client, submitter and a link - never amounts, tax IDs, bank or ID details.
 */
const GATEWAY = "https://connector-gateway.lovable.dev/slack/api";
export const OPS_SLACK_CHANNEL = "C057SPLASCR"; // #operations
export const COMPLIANCE_SLACK_CHANNEL = "C0C9TBQTXNY"; // #compliance-regulatory
const SITE = "https://app.harmonious.co";

const admin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;

export type SubmissionNotice = {
  kind: string;
  /** Short, non-sensitive label, e.g. "Document - Operating Agreement". */
  title: string;
  offeringId?: string | null;
  clientId?: string | null;
  submittedBy?: string | null;
  /** Path on the Harmonious site, e.g. "/ops/fund/123". */
  path?: string | null;
  /** Stable id of the thing submitted, for repeat suppression. */
  ref?: string | null;
  /** Completion alert: tags both the Operations owner and the Account Manager. */
  completed?: boolean;
};

/** Operations owner and Account Manager (distinct people). Pure, for tests. */
export function pickOwners(team: { role: string; userId: string | null }[]): { userId: string; role: string }[] {
  const out: { userId: string; role: string }[] = [];
  for (const role of ["operations", "account_manager"]) {
    const m = team.find((t) => t.role === role && t.userId && !out.some((o) => o.userId === t.userId));
    if (m) out.push({ userId: m.userId!, role });
  }
  return out;
}

/** Operations owner first, then Account Manager. Pure, for tests. */
export function pickOwner(team: { role: string; userId: string | null }[]): { userId: string; role: string } | null {
  for (const role of ["operations", "account_manager"]) {
    const m = team.find((t) => t.role === role && t.userId);
    if (m) return { userId: m.userId!, role };
  }
  return null;
}

/** Five-minute bucket so repeat clicks send one message. Pure, for tests. */
export function dedupeKey(n: Pick<SubmissionNotice, "kind" | "ref" | "offeringId" | "clientId" | "title">, at = Date.now()) {
  return `${n.kind}:${n.ref ?? n.offeringId ?? n.clientId ?? "-"}:${n.title}:${Math.floor(at / 300000)}`;
}

/** Only the allow-listed fields ever reach Slack. Pure, for tests. */
export function buildMessage(n: { title: string; place: string; submitter: string | null; mention: string | null; url: string; when: string; completed?: boolean }) {
  const tag = n.mention ?? "_No Operations owner assigned._";
  const head = n.completed ? "Completed" : "New submission";
  const text = `${tag} ${head} - ${n.place}`;
  return {
    text,
    blocks: [
      { type: "section", text: { type: "mrkdwn", text: `${tag} *${head} - ${n.place}*\n${n.title}` } },
      { type: "context", elements: [{ type: "mrkdwn", text: `${n.completed ? "Completed" : "Submitted"} by ${n.submitter ?? "someone"} · ${n.when}` }] },
      { type: "actions", elements: [{ type: "button", text: { type: "plain_text", text: "Open in Harmonious" }, url: n.url }] },
    ],
  };
}

async function slack(method: string, body: Record<string, unknown>) {
  const lk = process.env["LOVABLE_API_KEY"], key = process.env["SLACK_API_KEY"];
  if (!lk || !key) return { ok: false, error: "not_connected" } as any;
  const res = await fetch(`${GATEWAY}/${method}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${lk}`, "X-Connection-Api-Key": key, "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) console.error(`Slack ${method} failed [${res.status}]: ${data.error ?? "unknown"}`);
  return data;
}

async function slackIdFor(db: any, userId: string): Promise<string | null> {
  const { data: p } = await db.from("profiles").select("email, slack_user_id").eq("user_id", userId).maybeSingle();
  if (p?.slack_user_id) return p.slack_user_id;
  if (!p?.email) return null;
  const r = await slack(`users.lookupByEmail?email=${encodeURIComponent(p.email)}`, {});
  const id = r?.ok ? (r.user?.id as string) : null;
  if (id) await db.from("profiles").update({ slack_user_id: id }).eq("user_id", userId).then(() => null, () => null);
  return id;
}

export async function notifySubmission(n: SubmissionNotice): Promise<void> {
  try {
    const db = await admin();
    const key = dedupeKey(n);
    const { error: dup } = await db.from("ops_slack_notifications").insert({ dedupe_key: key, kind: n.kind, offering_id: n.offeringId ?? null, client_id: n.clientId ?? null, status: "pending" });
    if (dup) return; // already sent in this window
    const team = await import("@/lib/harmonious-team.server");
    let members: { role: string; userId: string | null }[] = [];
    let place = "Harmonious";
    let clientId = n.clientId ?? null;
    if (n.offeringId) {
      const t = await team.loadFundTeam(n.offeringId).catch(() => null);
      members = (t?.team ?? []) as any;
      clientId = clientId ?? t?.clientId ?? null;
      const { data: f } = await db.from("offerings").select("name").eq("id", n.offeringId).maybeSingle();
      place = f?.name ?? place;
    } else if (clientId) {
      members = ((await team.loadClientTeam(clientId)) as any[]).map((a) => ({ role: a.team_role, userId: a.user_id }));
      const { data: c } = await db.from("clients").select("name").eq("id", clientId).maybeSingle();
      place = c?.name ?? place;
    }
    // Never tag the submitter as their own reviewer.
    const others = members.filter((m) => m.userId !== n.submittedBy);
    const owners = n.completed ? pickOwners(others) : (() => { const o = pickOwner(others); return o ? [o] : []; })();
    const owner = owners[0] ?? null;
    const tags: string[] = [];
    for (const o of owners) {
      const sid = await slackIdFor(db, o.userId);
      if (sid) tags.push(`<@${sid}>`);
      else {
        const { data: op } = await db.from("profiles").select("legal_name, email").eq("user_id", o.userId).maybeSingle();
        tags.push(`*${op?.legal_name || op?.email || (o.role === "operations" ? "Operations owner" : "Account Manager")}*`);
      }
    }
    const mention: string | null = tags.length ? tags.join(" ") : null;
    const { data: sub } = n.submittedBy ? await db.from("profiles").select("legal_name, email").eq("user_id", n.submittedBy).maybeSingle() : { data: null };
    const when = new Date().toLocaleString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    const url = `${SITE}${n.path ?? (n.offeringId ? `/ops/fund/${n.offeringId}` : "/ops/queue")}`;
    const msg = buildMessage({ title: n.title, place, submitter: sub?.legal_name || sub?.email || null, mention, url, when, completed: n.completed ?? false });
    const r = await slack("chat.postMessage", { channel: OPS_SLACK_CHANNEL, unfurl_links: false, ...msg });
    await db.from("ops_slack_notifications").update({ status: r?.ok ? "sent" : "failed", error: r?.ok ? null : String(r?.error ?? "unknown"), slack_ts: r?.ts ?? null, tagged_user_id: owner?.userId ?? null, client_id: clientId }).eq("dedupe_key", key);
  } catch (e) {
    console.error("ops slack notify", e);
  }
}

/**
 * Posts to #compliance-regulatory when a person's KYC and AML are both fully
 * clear (approved with no hits). Best-effort, deduped per person; carries only
 * the person name, fund and a link - never ID numbers or screening details.
 */
export async function notifyComplianceClear(n: { personId: string; personName: string; offeringId?: string | null }): Promise<void> {
  try {
    const db = await admin();
    const key = `compliance_clear:${n.personId}`;
    const { error: dup } = await db.from("ops_slack_notifications").insert({ dedupe_key: key, kind: "compliance_clear", offering_id: n.offeringId ?? null, status: "pending" });
    if (dup) return; // already announced
    let place = "Harmonious";
    if (n.offeringId) {
      const { data: f } = await db.from("offerings").select("name").eq("id", n.offeringId).maybeSingle();
      place = f?.name ?? place;
    }
    const when = new Date().toLocaleString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    const url = `${SITE}/ops/compliance`;
    const text = `KYC/AML fully clear - ${n.personName}`;
    const r = await slack("chat.postMessage", {
      channel: COMPLIANCE_SLACK_CHANNEL,
      unfurl_links: false,
      text,
      blocks: [
        { type: "section", text: { type: "mrkdwn", text: `*KYC/AML fully clear - ${n.personName}*\n${place}` } },
        { type: "context", elements: [{ type: "mrkdwn", text: `Identity check and screening both approved · ${when}` }] },
        { type: "actions", elements: [{ type: "button", text: { type: "plain_text", text: "Open in Harmonious" }, url }] },
      ],
    });
    await db.from("ops_slack_notifications").update({ status: r?.ok ? "sent" : "failed", error: r?.ok ? null : String(r?.error ?? "unknown"), slack_ts: r?.ts ?? null }).eq("dedupe_key", key);
  } catch (e) {
    console.error("compliance slack notify", e);
  }
}
