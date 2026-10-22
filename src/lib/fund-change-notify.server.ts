/** Only called after a saved canonical event; no payload or investor terms leave. */
export async function notifyFundChange(input: { fundId: string; ref: string; title: "Fund fee terms" | "Side letter change" | "Saved fund information" | "Fund service request"; status: "requested" | "updated" | "approved" | "rejected"; actorId: string; tab?: "approvals" | "requests" }) {
  try {
    const tab = input.tab ?? "approvals";
    const { notifyFundManagers } = await import("@/lib/client-work-notify.server");
    await notifyFundManagers(input.fundId, "material_update", `${input.title}: ${input.status}`, `/client/funds/${input.fundId}?tab=${tab}`, `${input.ref}:${input.status}`);
    const { notifySubmission } = await import("@/lib/ops-slack-notify.server");
    if (input.title !== "Fund service request" || input.status !== "requested") await notifySubmission({ kind: `fund_change_${input.status}`, ref: input.ref, once: true, offeringId: input.fundId, submittedBy: input.actorId, title: `${input.title}: ${input.status}`, path: `/ops/fund/${input.fundId}?tab=${tab}`, completed: input.status === "approved" || input.status === "rejected" });
  } catch { /* Notifications must never turn a saved request into a failed save. */ }
}