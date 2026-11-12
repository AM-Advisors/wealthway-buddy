import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

// The investor portal must adopt the application already linked to the
// investor's exact open investment instead of creating a second one, and the
// one-time correction re-points only the affected investment.
const user = "11111111-1111-4111-8111-111111111111";
const other = "99999999-9999-4999-8999-999999999999";
const persona = "22222222-2222-4222-8222-222222222222";
const fund = "33333333-3333-4333-8333-333333333333";
const investment = "44444444-4444-4444-8444-444444444444";
const linkedApp = "55555555-5555-4555-8555-555555555555";
const profile = "66666666-6666-4666-8666-666666666666";
const person = "77777777-7777-4777-8777-777777777777";
const sql = readFileSync("drizzle/migrations/0392_claim_exact_investment_application.sql", "utf8");

let db: PGlite;
const claim = (p = persona) =>
  db.query<{ id: string | null }>("select claim_exact_investment_application($1, $2) as id", [fund, p]).then((r) => r.rows[0]?.id ?? null);

beforeAll(async () => {
    db = new PGlite();
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.user',true),'')::uuid $$;
      create table persons(id uuid primary key, kyc_status text, aml_status text, merged_into_person_id uuid);
      create table investor_personas(id uuid primary key, user_id uuid, kind text);
      create table investment_profiles(id uuid primary key, owner_user_id uuid, legacy_persona_id uuid, profile_type text);
      create table investor_applications(id uuid primary key default gen_random_uuid(), user_id uuid, offering_id uuid, persona_id uuid, kyc_status text default 'not_started', aml_status text default 'not_started');
      create table investor_onboardings(id uuid primary key, investor_user_id uuid, person_id uuid, offering_id uuid, application_id uuid, investment_profile_id uuid, removed_at timestamptz, closed_at timestamptz, stage text default 'verification', executed_snapshot jsonb, signature_id uuid, updated_at timestamptz);
      create table investor_record_changes(offering_id uuid, onboarding_id uuid, subject_table text, subject_id uuid, field text, old_value jsonb, new_value jsonb, source text, actor_user_id uuid, manager_visible boolean);
      create table document_signatures(application_id uuid);
      create table wire_requests(application_id uuid);
      create table payments(application_id uuid);
      create table notification_events(application_id uuid, event_kind text, field text, created_at timestamptz default now(), sent_at timestamptz, error text, metadata jsonb default '{}');
      create function notify() returns trigger language plpgsql as $$ begin
        if new.kyc_status is distinct from old.kyc_status then insert into notification_events(application_id,event_kind,field) values (new.id,'status_changed','kyc_status'); end if;
        if new.aml_status is distinct from old.aml_status then insert into notification_events(application_id,event_kind,field) values (new.id,'status_changed','aml_status'); end if;
        return new; end $$;
    create trigger notify after update on investor_applications for each row execute function notify();`);
    await db.exec(sql);
});
afterAll(async () => { await db.close(); });

describe("claim_exact_investment_application", () => {
  beforeEach(async () => {
    await db.exec(`reset role; truncate persons, investor_personas, investment_profiles, investor_applications, investor_onboardings, investor_record_changes, document_signatures, wire_requests, payments, notification_events;
      select set_config('test.user','${user}',false);
      insert into investor_personas values ('${persona}','${user}','individual');
      insert into investment_profiles values ('${profile}','${user}',null,'individual');
      insert into investor_applications(id,user_id,offering_id) values ('${linkedApp}','${user}','${fund}');
      insert into investor_onboardings(id,investor_user_id,person_id,offering_id,application_id,investment_profile_id) values ('${investment}','${user}','${person}','${fund}','${linkedApp}','${profile}');`);
  });

  it("adopts the application linked to the exact open investment and records it", async () => {
    expect(await claim()).toBe(linkedApp);
    expect((await db.query("select persona_id from investor_applications where id=$1", [linkedApp])).rows[0]).toEqual({ persona_id: persona });
    expect((await db.query("select field, source from investor_record_changes")).rows).toEqual([{ field: "persona_id", source: "exact_investment_claim" }]);
  });

  it("leaves things alone when the account already has its own application in the fund", async () => {
    await db.exec(`insert into investor_applications(user_id,offering_id,persona_id) values ('${user}','${fund}','${persona}')`);
    expect(await claim()).toBeNull();
    expect((await db.query("select persona_id from investor_applications where id=$1", [linkedApp])).rows[0]).toEqual({ persona_id: null });
  });

  it("does not attach a trust account to an individual investment", async () => {
    await db.exec(`update investor_personas set kind='trust'`);
    expect(await claim()).toBeNull();
  });

  it("does not guess when two open investments exist in the same fund", async () => {
    await db.exec(`insert into investor_onboardings(id,investor_user_id,offering_id,investment_profile_id) values (gen_random_uuid(),'${user}','${fund}','${profile}')`);
    expect(await claim()).toBeNull();
  });

  it.each(["closed", "declined", "cancelled"])("never claims a %s investment", async (stage) => {
    await db.query("update investor_onboardings set stage=$1", [stage]);
    expect(await claim()).toBeNull();
  });

  it("refuses another person's investing account", async () => {
    await db.query("select set_config('test.user',$1,false)", [other]);
    expect(await claim()).toBeNull();
    expect((await db.query("select persona_id from investor_applications where id=$1", [linkedApp])).rows[0]).toEqual({ persona_id: null });
  });

  it("anonymous callers cannot run it", async () => {
    await db.exec("set role anon");
    await expect(claim()).rejects.toThrow("permission denied");
  });
});

describe("one-time investment relink", () => {
  const onb = "1ffb5167-b7f2-4857-a78c-43dc7551bfd0";
  const oldApp = "6fb55786-3b29-4508-8efb-ff6f1dcd7722";
  const newApp = "a84fc669-81c3-4847-b4d4-eec035b45a0f";
  const jenner = "53118962-ed59-4d8a-a5d1-4f09a4dba8cb";
  const seed = async () => {
    await db.exec(`reset role; truncate persons, investor_personas, investment_profiles, investor_applications, investor_onboardings, investor_record_changes, document_signatures, wire_requests, payments, notification_events;
      insert into persons values ('${person}','approved','approved',null);
      insert into investor_applications(id,user_id,offering_id,persona_id,kyc_status,aml_status) values ('${oldApp}','${jenner}','${fund}',null,'approved','approved'), ('${newApp}','${jenner}','${fund}','${persona}','review','review');
      insert into investor_onboardings(id,investor_user_id,person_id,offering_id,application_id) values ('${onb}','${jenner}','${person}','${fund}','${oldApp}');`);
  };

  it("points the investment at the application holding the investor's work, with approvals carried over and no repeat emails", async () => {
    await seed();
    await db.exec(sql);
    expect((await db.query("select application_id from investor_onboardings where id=$1", [onb])).rows[0]).toEqual({ application_id: newApp });
    expect((await db.query("select kyc_status, aml_status from investor_applications where id=$1", [newApp])).rows[0]).toEqual({ kyc_status: "approved", aml_status: "approved" });
    expect((await db.query("select count(*)::int n from notification_events where sent_at is null")).rows[0]).toEqual({ n: 0 });
    expect((await db.query("select count(*)::int n from investor_applications")).rows[0]).toEqual({ n: 2 });
  });

  it("does nothing once anything has been signed", async () => {
    await seed();
    await db.exec(`insert into document_signatures values ('${oldApp}')`);
    await db.exec(sql);
    expect((await db.query("select application_id from investor_onboardings where id=$1", [onb])).rows[0]).toEqual({ application_id: oldApp });
  });
});
