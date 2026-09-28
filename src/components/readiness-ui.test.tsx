import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AttentionNeeded, QueueAge, ReadinessSurface, StageJourney } from "@/components/investment-readiness";
import { EditContextBannerView, PerspectiveList, ViewAsBanner } from "@/components/view-as";
import { bucketOf, closeHeadline, isAging, plainStatus, toggleStage, waitingLabel } from "@/lib/readiness-presentation";
import { editContextIsLive, subjectAllowed } from "@/lib/view-as";

const stage = (stage: string, title: string, status: string) => ({ stage, title, status });
const base = {
  ruleVersion: "readiness-v1", percentComplete: 75, requiredCount: 8, completeCount: 6, closeReady: false, closeBlockers: ["Signature"],
  nextAction: { label: "Sign subscription documents", owner: "investor" }, requestedCloseDate: null, terminal: null, currentStage: "subscription",
  stages: [stage("identity", "Identity & Verification", "complete"), stage("subscription", "Subscription Documents", "needs_investor")],
  items: [
    { key: "identity_verification", stage: "identity", label: "Identity verified", status: "complete", owner: null, required: true },
    { key: "signature", stage: "subscription", label: "Signature", status: "needs_investor", owner: "investor", required: true, action: "Sign subscription documents" },
  ],
};
const clean = { ...base, closeReady: true, nextAction: null, items: base.items.map((i) => ({ ...i, status: "complete", owner: null })) };
const html = (el: any) => renderToStaticMarkup(el);

describe("readiness summary header", () => {
  it("leads with close readiness, next action, owner, progress and target close", () => {
    const h = html(<ReadinessSurface r={base} viewer="staff" title="Jane Smith" subtitle="Chapter 7 · $100,000 investment" />);
    expect(h).toContain("Not Ready to Close");
    expect(h).toContain("1 item still needs attention");
    for (const t of ["Next Action", "Sign subscription documents", "Owner", "Investor", "Progress", "75%", "Target Close", "Not scheduled"]) expect(h).toContain(t);
    expect(closeHeadline({ terminal: "closed" })).toBe("Closed");
  });
});

describe("Attention Needed", () => {
  it("is hidden when nothing is actionable", () => {
    expect(html(<AttentionNeeded r={clean} viewer="staff" />)).toBe("");
  });
  it("appears with owner and plain status when actions exist", () => {
    const h = html(<AttentionNeeded r={base} viewer="investor" />);
    expect(h).toContain("Attention Needed");
    expect(h).toContain("Investor action");
    expect(h).toContain("Needs your attention");
  });
});

describe("stage timeline", () => {
  it("expands and collapses one stage at a time", () => {
    expect(toggleStage(null, "tax")).toBe("tax");
    expect(toggleStage("tax", "tax")).toBeNull();
    expect(toggleStage("tax", "funding")).toBe("funding");
    const closed = html(<StageJourney r={base} viewer="staff" />);
    expect(closed).not.toContain("Signature</span>");
    const open = html(<StageJourney r={base} viewer="staff" defaultOpen="subscription" />);
    expect(open).toContain('data-open="true"');
    expect(open).toContain("Signature");
  });
  it("keeps completed stages visually secondary and marks the current stage", () => {
    const h = html(<StageJourney r={base} viewer="staff" />);
    const done = h.slice(h.indexOf('data-stage="identity"'), h.indexOf('data-stage="subscription"'));
    expect(done).toContain("text-muted-foreground");
    expect(done).not.toContain("font-medium");
    expect(h.slice(h.indexOf('data-stage="subscription"'))).toContain("Current");
  });
  it("never shows staff-only audit detail to clients", () => {
    expect(html(<ReadinessSurface r={base} viewer="investor" title="x" subtitle="y" />)).not.toContain("Audit &amp; Details");
    expect(html(<ReadinessSurface r={base} viewer="staff" title="x" subtitle="y" />)).toContain("Audit &amp; Details");
  });
});

describe("View client perspective", () => {
  it("lists only the server-confirmed related people and excludes staff accounts", () => {
    expect(subjectAllowed({ isStaff: true })).toBe(false);
    const h = html(<PerspectiveList items={[{ perspective: "investor", subjectUserId: "a", name: "Jane Smith" }, { perspective: "fund_manager", subjectUserId: "b", name: "McKay Pettit" }]} onPick={() => {}} />);
    expect(h.match(/data-perspective=/g)?.length).toBe(2);
    expect(h).toContain("Jane Smith");
    expect(h).toContain("Fund Manager");
    expect(html(<PerspectiveList items={[]} onPick={() => {}} />)).toContain("No client perspective is available yet");
  });
});

describe("mode banners", () => {
  it("Client View banner is present and read-only", () => {
    const h = html(<ViewAsBanner ctx={{ subjectName: "Jane Smith", roleLabel: "Investor", fundName: "Chapter 7", amountCents: 10000000 }} />);
    expect(h).toContain('data-mode="client-view"');
    expect(h).toContain('aria-readonly="true"');
    expect(h).toContain("Viewing as Jane Smith · Investor");
    expect(h).toContain("Read-only");
  });
  const ctx = { subjectName: "Jane Smith", roleLabel: "Investor", clientName: "Acme Capital", fundName: "Chapter 7", investmentProfileLabel: "Jane Smith IRA", amountCents: 10000000 };
  it("Edit as Harmonious banner retains the originating context and looks different", () => {
    const h = html(<EditContextBannerView ctx={ctx} onReturn={() => {}} onExit={() => {}} />);
    expect(h).toContain('data-mode="edit-as-harmonious"');
    for (const t of ["Editing as Harmonious", "You came from Client View for Jane Smith · Investor", "Acme Capital", "Chapter 7", "Jane Smith IRA", "$100,000", "Changes are recorded as Harmonious administrative actions.", "Return to Client View", "Exit edit context"]) expect(h).toContain(t);
    expect(h).not.toContain("client-view");
  });
  it("exited, stale, or other-session edit context is not live", () => {
    const now = Date.parse("2026-09-28T12:00:00Z");
    const row = { staff_user_id: "s", auth_session_id: "x", ended_at: "2026-09-28T11:30:00Z", end_reason: "edit_as_harmonious" };
    expect(editContextIsLive(row, "s", "x", now)).toBe(true);
    expect(editContextIsLive({ ...row, end_reason: "edit_context_exited" }, "s", "x", now)).toBe(false);
    expect(editContextIsLive({ ...row, ended_at: "2026-09-28T10:00:00Z" }, "s", "x", now)).toBe(false);
    expect(editContextIsLive(row, "s", "other", now)).toBe(false);
    expect(editContextIsLive(row, "other", "x", now)).toBe(false);
  });
});

describe("Operations queue wording", () => {
  it("uses waiting/aging language, never SLA wording", () => {
    expect(waitingLabel(0)).toBe("Waiting since today");
    expect(waitingLabel(1)).toBe("Waiting 1 day");
    expect(waitingLabel(5)).toBe("Waiting 5 days");
    expect(isAging(2)).toBe(false);
    const h = html(<QueueAge days={3} />);
    expect(h).toContain("Waiting 3 days");
    expect(h).toContain("Aging");
    expect(h).not.toMatch(/overdue|sla|past due|late/i);
  });
});

describe("responsive layout", () => {
  it("core readiness information stacks instead of scrolling sideways", () => {
    const h = html(<ReadinessSurface r={base} viewer="staff" title="Jane" subtitle="Chapter 7" />);
    expect(h).not.toContain("<table");
    expect(h).not.toContain("overflow-x-auto");
    expect(h).toContain("grid-cols-2");
    expect(plainStatus("needs_fund_manager", "manager")).toBe("Needs your attention");
    expect(bucketOf({ closeReady: false, readiness: base, nextAction: base.nextAction })).toBe("needs_investor");
  });
});
