import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const person = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const app = "33333333-3333-4333-8333-333333333333";
const fund = "44444444-4444-4444-8444-444444444444";
let db: PGlite;
describe("future exact-person synchronization, fictional offline database", () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
      create table persons(id uuid primary key, kyc_status text, aml_status text, merged_into_person_id uuid);
      create table investor_applications(id uuid primary key, offering_id uuid, kyc_status text, aml_status text, updated_at timestamptz, documents_status text default 'approved', funding_status text default 'not_funded');
      create table investor_onboardings(id uuid primary key default gen_random_uuid(), application_id uuid, offering_id uuid, person_id uuid, removed_at timestamptz, closed_at timestamptz, stage text);
      create table investor_record_changes(id uuid default gen_random_uuid(), offering_id uuid, onboarding_id uuid, subject_table text, subject_id uuid, field text, old_value jsonb, new_value jsonb, source text, actor_user_id uuid, manager_visible boolean);`);
    await db.exec(readFileSync(".lovable/drafts/drft_01m5zdmb66efsvwbd4dgkmfpbg/migrations/20261027210000_forward_person_verification.sql", "utf8"));
  });
  afterAll(async () => { await db.close(); });
  beforeEach(async () => {
    await db.exec(`truncate persons, investor_applications, investor_onboardings, investor_record_changes;
      insert into persons values ('${person}', 'review', 'review', null), ('${other}', 'approved', 'approved', null);
      insert into investor_applications(id, offering_id, kyc_status, aml_status) values ('${app}', '${fund}', 'review', 'review');
      insert into investor_onboardings(application_id, offering_id, person_id, stage) values ('${app}', '${fund}', '${person}', 'verification');`);
  });
  const current = async () => (await db.query<any>("select * from investor_applications")).rows[0];
  const approve = () => db.exec(`update persons set kyc_status='approved', aml_status='approved' where id='${person}'`);
  it("does not backfill existing records on installation", async () => {
    expect((await current()).kyc_status).toBe("review");
    expect((await db.query("select * from investor_record_changes")).rows).toHaveLength(0);
  });
  it("syncs future exact-person decisions and retains separate document/funding state", async () => {
    await approve();
    expect(await current()).toMatchObject({ kyc_status: "approved", aml_status: "approved", documents_status: "approved", funding_status: "not_funded" });
    expect((await db.query("select * from investor_record_changes")).rows).toHaveLength(2);
  });
  it("syncs review and declined instead of retaining old approval", async () => {
    await approve();
    await db.exec(`update persons set kyc_status='review', aml_status='declined' where id='${person}'`);
    expect(await current()).toMatchObject({ kyc_status: "review", aml_status: "declined" });
  });
  it("never updates a different investing person", async () => {
    await db.exec(`update investor_onboardings set person_id='${other}'`);
    await approve();
    expect((await current()).kyc_status).toBe("review");
  });
  it.each(["closed", "declined", "cancelled"])("preserves %s investment history", async (stage) => {
    await db.query("update investor_onboardings set stage=$1", [stage]); await approve();
    expect((await current()).kyc_status).toBe("review");
  });
  it.each(["removed_at", "closed_at"])("preserves investments with %s", async (column) => {
    await db.exec(`update investor_onboardings set ${column}=now()`); await approve();
    expect((await current()).kyc_status).toBe("review");
  });
  it("refuses ambiguous application links", async () => {
    await db.exec(`insert into investor_onboardings(application_id, offering_id, person_id, stage) values ('${app}', '${fund}', '${other}', 'verification')`);
    await approve(); expect((await current()).kyc_status).toBe("review");
  });
  it("does not synchronize a merged-away person", async () => {
    await db.exec(`update persons set merged_into_person_id='${other}' where id='${person}'`);
    await approve(); expect((await current()).kyc_status).toBe("review");
  });
  it("does not duplicate audit evidence on retry", async () => {
    await approve(); await approve();
    expect((await db.query("select * from investor_record_changes")).rows).toHaveLength(2);
  });
  it("rolls back person and application updates when audit fails", async () => {
    await db.exec(`alter table investor_record_changes add constraint test_audit_failure check (field <> 'kyc_status')`);
    try {
      await expect(approve()).rejects.toThrow();
      expect((await current()).kyc_status).toBe("review");
      expect((await db.query<any>(`select kyc_status from persons where id='${person}'`)).rows[0]?.kyc_status).toBe("review");
    } finally { await db.exec("alter table investor_record_changes drop constraint test_audit_failure"); }
  });
});