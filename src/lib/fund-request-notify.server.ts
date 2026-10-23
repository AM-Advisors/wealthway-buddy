/**
 * Outbound notices when a client sends a new fund/SPV request: Slack (#operations)
 * and a Salesforce Opportunity. Each is best-effort and never blocks the request.
 */
const GATEWAY = "https://connector-gateway.lovable.dev";
const SLACK_CHANNEL = "C057SPLASCR"; // #operations

type Notice = { clientName: string; fundName: string; isSpv: boolean; vehicle: string; jurisdiction: string; targetRaise: string; expectedClose: string; opsUrl: string; requestId: string };

function headers(key: string) {
  return { Authorization: `Bearer ${process.env["LOVABLE_API_KEY"]}`, "X-Connection-Api-Key": key, "Content-Type": "application/json" };
}

export async function postSlackNotice(n: Notice) {
  const key = process.env["SLACK_API_KEY"];
  if (!key || !process.env["LOVABLE_API_KEY"]) return { ok: false, skipped: "not_connected" };
  const text = `New ${n.isSpv ? "SPV" : "fund"} request from *${n.clientName}*: *${n.fundName}*`;
  const res = await fetch(`${GATEWAY}/slack/api/chat.postMessage`, {
    method: "POST",
    headers: headers(key),
    body: JSON.stringify({
      channel: SLACK_CHANNEL,
      text,
      username: "Harmonious Portal",
      blocks: [
        { type: "section", text: { type: "mrkdwn", text } },
        { type: "section", fields: [
          { type: "mrkdwn", text: `*Structure*\n${n.vehicle || "-"}` },
          { type: "mrkdwn", text: `*Jurisdiction*\n${n.jurisdiction || "-"}` },
          { type: "mrkdwn", text: `*Target raise*\n${n.targetRaise || "-"}` },
          { type: "mrkdwn", text: `*Expected close*\n${n.expectedClose || "-"}` },
        ] },
        { type: "actions", elements: [{ type: "button", text: { type: "plain_text", text: "Open in Harmonious" }, url: n.opsUrl }] },
      ],
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) console.error(`Slack notice failed [${res.status}]: ${JSON.stringify(body)}`);
  return { ok: !!body.ok, error: body.error };
}

const soql = (v: string) => v.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

export async function createSalesforceOpportunity(n: Notice) {
  const key = process.env["SALESFORCE_API_KEY"];
  if (!key || !process.env["LOVABLE_API_KEY"]) return { ok: false, skipped: "not_connected" };
  const base = `${GATEWAY}/salesforce`;
  let accountId: string | undefined;
  const q = await fetch(`${base}/query?q=${encodeURIComponent(`SELECT Id FROM Account WHERE Name = '${soql(n.clientName)}' LIMIT 1`)}`, { headers: headers(key) });
  if (q.ok) accountId = (await q.json())?.records?.[0]?.Id;
  else console.error(`Salesforce account lookup failed [${q.status}]: ${await q.text()}`);
  const close = /^\d{4}-\d{2}-\d{2}$/.test(n.expectedClose) ? n.expectedClose : new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  const amount = Number(String(n.targetRaise).replace(/[^0-9.]/g, "")) || undefined;
  const res = await fetch(`${base}/sobjects/Opportunity`, {
    method: "POST",
    headers: headers(key),
    body: JSON.stringify({
      Name: `${n.clientName} - ${n.fundName} (${n.isSpv ? "SPV" : "Fund"} setup)`.slice(0, 120),
      StageName: "Prospecting",
      CloseDate: close,
      ...(accountId ? { AccountId: accountId } : {}),
      ...(amount ? { Amount: amount } : {}),
      Description: `Client portal new ${n.isSpv ? "SPV" : "fund"} request ${n.requestId}. Structure: ${n.vehicle || "-"}; jurisdiction: ${n.jurisdiction || "-"}. ${n.opsUrl}`,
    }),
  });
  if (!res.ok) { console.error(`Salesforce opportunity failed [${res.status}]: ${await res.text()}`); return { ok: false }; }
  return { ok: true, id: (await res.json())?.id as string | undefined };
}
