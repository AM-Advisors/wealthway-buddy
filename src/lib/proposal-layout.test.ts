import { expect, test } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderProposalPdf } from "./proposal-layout.server";

const doc = { title: "Roas Capital Management", recipient_name: "Dana" };
const sections = [{ key: "summary", title: "Summary", body: "Fund administration for Roas." }];
const lines = [
  { label: "White Glove Fund Administration", quantity: 1, unit_cents: 1200000, line_cents: 1200000, billing_frequency: "quarterly" },
  { label: "Tax service", quantity: 1, unit_cents: 4800000, line_cents: 4800000, billing_frequency: "annual" },
  { label: "Setup", quantity: 1, unit_cents: 250000, line_cents: 250000, billing_frequency: "one_time" },
];

/** The words a client actually reads off the finished document. */
function pdfText(bytes: Uint8Array): string {
  const dir = mkdtempSync(join(tmpdir(), "proposal-pdf-"));
  const file = join(dir, "proposal.pdf");
  writeFileSync(file, Buffer.from(bytes));
  const run = spawnSync("pdftotext", ["-layout", file, "-"], { encoding: "latin1" });
  if (run.error || run.status !== 0) throw new Error("pdftotext is required to read the rendered proposal: " + (run.error?.message ?? run.status));
  return run.stdout;
}

test("proposal PDF quotes quarterly and annual bills only", async () => {
  const text = pdfText(await renderProposalPdf(doc as any, sections as any, lines as any, false));
  expect(text).toContain("YOU'RE BILLED");
  expect(text).toContain("Billed quarterly: $12,000 every 3 months");
  expect(text).toContain("Billed annually: $48,000 once a year");
  expect(text).toContain("One-time fees: $2,500, billed once when you sign");
  expect(text).not.toMatch(/monthly|per month/i);
});
