import { describe, expect, it } from "vitest";
import { planSignPlacements } from "./pdf-sign-tags.server";

const it_ = (str: string, y: number, x = 100) => ({ str, x, y, w: 40 });
const pages = [
  { index: 0, text: "Terms", items: [it_("Terms", 700)] },
  { index: 15, text: "SIGNATURE PAGE INDIVIDUALS", items: [it_("Date:", 500), it_("(Signature)", 300), it_("(Signature)", 300, 400)] },
  { index: 16, text: "SIGNATURE PAGE ENTITIES", items: [it_("Date:", 500), it_("(Signature of Signatory)", 250)] },
  { index: 17, text: "ACCEPTANCE OF SUBSCRIPTION", items: [it_("(Signature)", 200), it_("Date:", 150)] },
];

describe("guided signature placement", () => {
  it("individual investor signs only on the Individuals page, Subscriber #1", () => {
    const p = planSignPlacements(pages, { investorIsEntity: false, fundCountersigns: true });
    expect(p.find((x) => x.tag === "[[s|1]]")).toMatchObject({ pageIndex: 15, x: 100 });
    expect(p.find((x) => x.tag === "[[s|2]]")?.pageIndex).toBe(17);
  });
  it("entity investor signs on the Entities page", () => {
    const p = planSignPlacements(pages, { investorIsEntity: true, fundCountersigns: false });
    expect(p.find((x) => x.tag === "[[s|1]]")?.pageIndex).toBe(16);
    expect(p.some((x) => x.tag === "[[s|2]]")).toBe(false);
  });
});
