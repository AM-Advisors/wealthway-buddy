import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeEach, afterEach, expect, it } from "vitest";
let db: PGlite;
const manager = "00000000-0000-0000-0000-000000000001";
const reviewer = "00000000-0000-0000-0000-000000000002";
beforeEach(async () => {
  db = new PGlite();
  await db.exec(`CREATE TABLE offering_documents(id uuid PRIMARY KEY, current_version integer, active_version integer);
    CREATE TABLE offering_document_versions(id uuid PRIMARY KEY, offering_id uuid, offering_document_id uuid, version integer, file_path text, created_by uuid, approved_by uuid, approved_at timestamptz, approval_status text, signing_config jsonb);
    CREATE TABLE fund_managers(offering_id uuid, user_id uuid);
    CREATE TABLE user_roles(user_id uuid, role text);
    CREATE TABLE offering_document_events(offering_id uuid, offering_document_id uuid, version integer, event text, actor_user_id uuid, detail jsonb);
    CREATE FUNCTION sod_override_active(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
    INSERT INTO offering_documents VALUES ('${manager}',1,NULL);
    INSERT INTO fund_managers VALUES ('${manager}','${manager}'),('${manager}','${reviewer}');`);
  await db.exec(readFileSync("drizzle/migrations/0349_self_serve_document_review.sql", "utf8"));
  // Apply the current routine-review policy after the original immutable-history schema.
  const current = readFileSync("drizzle/migrations/0361_single_routine_document_reviews.sql", "utf8");
  await db.exec(current.slice(0, current.indexOf("CREATE OR REPLACE FUNCTION public.guard_side_letter_change_request")));
  await db.exec(`INSERT INTO offering_document_versions(id,offering_id,offering_document_id,version,file_path,created_by,approval_status,self_serve_review_state) VALUES ('${manager}','${manager}','${manager}',1,'private/draft.docx','${manager}','uploaded_review_required','pending');`);
});
afterEach(async () => { await db.close(); });
const approve = (who: string) => db.exec(`UPDATE offering_document_versions SET self_serve_review_state='approved',approval_status='approved',approved_by='${who}',approved_at=now() WHERE id='${manager}'`);
it("generation cannot activate without an approval", async () => {
  await expect(db.exec(`UPDATE offering_documents SET active_version=1`)).rejects.toThrow("Approve");
});
it("an authorized exact-fund preparer approves transactionally with recorded evidence", async () => {
  await approve(manager);
  expect((await db.query<{ actor_user_id: string }>("SELECT actor_user_id FROM offering_document_events")).rows[0]?.actor_user_id).toBe(manager);
});
it("another exact-fund manager approves and activation preserves review evidence", async () => {
  await approve(reviewer);
  await db.exec(`UPDATE offering_documents SET active_version=1`);
  expect((await db.query<{ active_version: number }>("SELECT active_version FROM offering_documents")).rows[0]?.active_version).toBe(1);
  expect((await db.query<{ actor_user_id: string }>("SELECT actor_user_id FROM offering_document_events")).rows[0]?.actor_user_id).toBe(reviewer);
});
it("other-fund reviewers cannot approve", async () => { await expect(approve("00000000-0000-0000-0000-000000000003")).rejects.toThrow("manage this fund"); });
it("stale versions cannot unlock the current draft", async () => {
  await db.exec("UPDATE offering_documents SET current_version=2");
  await expect(approve(reviewer)).rejects.toThrow("current version");
});
it("returned drafts require a reason and a fresh version", async () => {
  await expect(db.exec(`UPDATE offering_document_versions SET self_serve_review_state='returned',approved_by='${reviewer}',approved_at=now()`)).rejects.toThrow("reason");
  await db.exec(`UPDATE offering_document_versions SET self_serve_review_state='returned',approved_by='${reviewer}',approved_at=now(),self_serve_review_note='Incorrect fund terms'`);
  await expect(approve(reviewer)).rejects.toThrow("already recorded");
});
it("approved files and signing configuration cannot be rewritten", async () => {
  await approve(reviewer);
  await expect(db.exec("UPDATE offering_document_versions SET file_path='replacement.docx'")).rejects.toThrow("immutable");
  await expect(db.exec(`UPDATE offering_document_versions SET signing_config='{}'`)).rejects.toThrow("frozen");
});
it("later uploads inherit review without altering earlier signed copies", async () => {
  await approve(reviewer);
  await db.exec(`INSERT INTO offering_document_versions(id,offering_id,offering_document_id,version,file_path,created_by,approval_status) VALUES ('${reviewer}','${manager}','${manager}',2,'private/new.docx','${manager}','uploaded_review_required')`);
  const rows = (await db.query<{ version: number; self_serve_review_state: string }>("SELECT version,self_serve_review_state FROM offering_document_versions ORDER BY version")).rows;
  expect(rows).toEqual([{ version: 1, self_serve_review_state: "approved" }, { version: 2, self_serve_review_state: "pending" }]);
});