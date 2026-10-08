import { appendFileSync } from "node:fs";
import { guard, step, U, N, BATCH } from "./lib";
const d = await guard();
const op = await import("@/lib/opening-positions.server");
const OJ = "503ad832-e33d-44d8-8d0b-5b20dbd51cb3";
const before = (await d.from("journal_entries").select("id", { count: "exact", head: true }).eq("book_id", "d1fd4e89-8028-4aec-b0a6-9901e48efe03")).count;
for (const [k, uid] of Object.entries(U)) { await d.from("user_roles").upsert({ user_id: uid, role: "admin" }, { onConflict: "user_id,role", ignoreDuplicates: true }); appendFileSync("/tmp/wt/grants.jsonl", JSON.stringify({ account: k, role: "admin", purpose: `${BATCH} opening positions (temporary)`, grantedAt: new Date().toISOString() }) + "\n"); }
try {
  const src = "DEMO / SYNTHETIC prior-administrator schedule of investments as of 2025-12-31";
  const P = [
    { issuerName: "Lumen Bio, Inc.", assetName: "Series A", assetClass: "private_preferred", costBasisCents: 300_000_000, openingFairValueCents: 350_000_000, evidenceStatus: "missing_in_source" as const },
    { issuerName: "Gridwise Energy, Inc.", assetName: "Seed", assetClass: "private_preferred", costBasisCents: 250_000_000, openingFairValueCents: 275_000_000, evidenceStatus: "present" as const },
    { issuerName: "Parcel Robotics, Inc.", assetName: "SAFE", assetClass: "safe", costBasisCents: 200_000_000, openingFairValueCents: 200_000_000, evidenceStatus: "present" as const },
  ];
  await step("wrong fund journal refused", async () => { const { data: other } = await d.from("journal_entries").select("id").neq("book_id", "d1fd4e89-8028-4aec-b0a6-9901e48efe03").eq("status", "posted").limit(1).single(); return op.prepareOpeningPosition(U.prep, { offeringId: N, batchRef: BATCH, sourceSystem: "x", sourceReference: "x", asOfDate: "2025-12-31", ...P[0], openingJournalId: other.id }); }, true);
  const ids: string[] = [];
  for (const p of P) { const r: any = await step(`prepare ${p.issuerName}`, () => op.prepareOpeningPosition(U.prep, { offeringId: N, batchRef: BATCH, sourceSystem: "DEMO prior administrator (synthetic)", sourceReference: src, asOfDate: "2025-12-31", ...p, openingJournalId: OJ })); ids.push(r.id); }
  await step("prepare Lumen again (idempotent)", () => op.prepareOpeningPosition(U.prep, { offeringId: N, batchRef: BATCH, sourceSystem: "x", sourceReference: src, asOfDate: "2025-12-31", ...P[0], openingJournalId: OJ }));
  await step("preparer self-approve", () => op.decideOpeningPosition(U.prep, ids[2]!, true, "self"), true);
  for (const id of ids) if ((await d.from("portfolio_opening_positions").select("status").eq("id", id).single()).data.status === "prepared") await step("approve", () => op.decideOpeningPosition(U.appr, id, true, "Ties to DEMO prior-administrator schedule and posted opening journal"));
  await step("approve again", () => op.decideOpeningPosition(U.rev, ids[0]!, true, "dup"), true);
  const ed = await d.from("portfolio_opening_positions").update({ cost_basis_cents: 1 }).eq("id", ids[0]); console.log("edit approved position:", ed.error ? "REFUSED" : "UPDATED (BUG)");
  console.log("TIE", JSON.stringify(await op.openingSubledgerCheck(N, "2025-12-31")));
  const after = (await d.from("journal_entries").select("id", { count: "exact", head: true }).eq("book_id", "d1fd4e89-8028-4aec-b0a6-9901e48efe03")).count;
  console.log("journals before", before, "after", after);
  const { data: a } = await d.from("portfolio_assets").select("issuer_name,cost_basis_cents").eq("offering_id", N); console.log("assets", JSON.stringify(a));
} finally {
  for (const uid of Object.values(U)) await d.from("user_roles").delete().eq("user_id", uid).in("role", ["admin", "operations"]);
  appendFileSync("/tmp/wt/grants.jsonl", JSON.stringify({ revokedAt: new Date().toISOString() }) + "\n"); console.log("access removed");
}
