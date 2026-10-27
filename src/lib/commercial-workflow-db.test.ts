import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
let db: PGlite;
const actor = "11111111-1111-4111-8111-111111111111", owner = "22222222-2222-4222-8222-222222222222", lead = "33333333-3333-4333-8333-333333333333";
describe("fictional commercial transaction and ownership", () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`create role service_role; create role anon; create role authenticated;
      create table user_roles(user_id uuid, role text); create table sales_reporting_lines(user_id uuid,manager_user_id uuid);
      create table marketing_leads(id uuid primary key,name text,work_email text,company text,intent text);
      create table crm_companies(id uuid primary key default gen_random_uuid(),scope text,offering_id uuid,owner_user_id uuid,name text);
      create table crm_contacts(id uuid primary key default gen_random_uuid(),scope text,offering_id uuid,owner_user_id uuid,created_by uuid,full_name text,email text,organization text,company_id uuid,source text,consent text,archived_at timestamptz);
      create table crm_deals(id uuid primary key default gen_random_uuid(),scope text,owner_user_id uuid,created_by uuid,contact_id uuid,title text,stage text,sales_stage text,stage_changed_at timestamptz);
      create table crm_activity(scope text,contact_id uuid,deal_id uuid,actor_user_id uuid,kind text,summary text,details jsonb);
      create table email_flow_enrollments(contact_id uuid,owner_user_id uuid,status text);
      create table email_unsubscribes(email text,unsubscribed_at timestamptz);
      create table sales_channel_optouts(contact_id uuid,channel text);
      create table access_permission_grants(user_id uuid,permission text,effect text,revoked_at timestamptz,effective_at timestamptz,expires_at timestamptz);`);
    await db.exec(readFileSync("drizzle/migrations/0342_commercial_intake_and_contact_source_links.sql", "utf8"));
    await db.exec(readFileSync("drizzle/migrations/0343_commercial_suppression_and_atomic_intake.sql", "utf8"));
    await db.exec(`alter table email_unsubscribes add column token uuid default gen_random_uuid(); alter table email_unsubscribes add unique(email);
      alter table crm_contacts add column consent_recorded_at timestamptz;
      alter table email_flow_enrollments add column stop_reason text; alter table email_flow_enrollments add column stopped_at timestamptz; alter table email_flow_enrollments add column next_due_at timestamptz;`);
    await db.exec(readFileSync("drizzle/migrations/0344_commercial_contact_match_review_queue.sql", "utf8"));
  });
  afterAll(async () => db.close());
  beforeEach(async () => {
    await db.exec(`truncate commercial_intake_links,crm_contact_source_links,crm_activity,email_flow_enrollments,crm_deals,crm_contacts,crm_companies,marketing_leads,user_roles,sales_reporting_lines,email_unsubscribes,sales_channel_optouts;
      insert into user_roles values('${actor}','super_admin'),('${owner}','sales');
      insert into marketing_leads values('${lead}','Fictional Person','person@example.test','Fictional Company','fund_administration');`);
  });
  const qualify = () => db.query<{ result: { contact_id: string; deal_id: string } }>(`select qualify_commercial_inquiry($1,$2,$3) as result`, [actor,lead,owner]);
  it("creates one prospect and deal on repeated qualification, without granting access or consent", async () => {
    const first = await qualify(); expect((await qualify()).rows).toEqual(first.rows);
    expect((await db.query("select consent,owner_user_id from crm_contacts")).rows).toEqual([{ consent: "unknown", owner_user_id: owner }]);
    expect((await db.query("select count(*)::int as n from crm_deals")).rows).toEqual([{ n: 1 }]);
  });
  it("denies non-leadership qualification", async () => { await db.exec(`update user_roles set role='sales' where user_id='${actor}'`); await expect(qualify()).rejects.toThrow("Sales leadership"); });
  it("does not silently duplicate a matching email", async () => { await db.exec(`insert into crm_contacts(email,scope,owner_user_id) values('PERSON@example.test','harmonious','${actor}')`); await expect(qualify()).rejects.toThrow("Review a matching contact"); });
  it("transfers only active follow-up ownership", async () => {
    const contact = (await qualify()).rows[0]?.result.contact_id;
    await db.query("insert into email_flow_enrollments values($1,$2,'active'),($1,$2,'completed')", [contact,owner]);
    await db.query("update crm_contacts set owner_user_id=$1 where id=$2", [actor,contact]);
    expect((await db.query("select owner_user_id,status from email_flow_enrollments order by status")).rows).toEqual([{ owner_user_id: actor, status: "active" }, { owner_user_id: owner, status: "completed" }]);
  });
  it("suppresses mixed-case opt-outs across all sources", async () => {
    await db.exec(`insert into email_unsubscribes(email,unsubscribed_at) values(' PERSON@Example.test ',now())`);
    expect((await db.query("select * from promotional_suppressed_emails(array['person@example.test'])")).rows).toEqual([{ email: "person@example.test" }]);
  });
  it("records unsubscribe atomically and retains the original unsubscribe token", async () => {
    const contact = (await qualify()).rows[0]?.result.contact_id;
    await db.query("insert into email_flow_enrollments(contact_id,owner_user_id,status) values($1,$2,'active')",[contact,owner]);
    await db.exec("select record_promotional_unsubscribe(' PERSON@example.test ')");
    const first = (await db.query("select token from email_unsubscribes")).rows;
    await db.exec("select record_promotional_unsubscribe('person@example.test')");
    expect((await db.query("select token from email_unsubscribes")).rows).toEqual(first);
    expect((await db.query("select consent from crm_contacts")).rows).toEqual([{consent:'unsubscribed'}]);
    expect((await db.query("select status from email_flow_enrollments")).rows).toEqual([{status:'stopped'}]);
  });
  it("rolls back all qualification writes when linking fails", async () => {
    await db.exec("alter table commercial_intake_links add constraint fictional_failure check(false) not valid");
    try { await expect(qualify()).rejects.toThrow(); expect((await db.query("select count(*)::int as n from crm_contacts")).rows).toEqual([{ n: 0 }]); }
    finally { await db.exec("alter table commercial_intake_links drop constraint fictional_failure"); }
  });
});