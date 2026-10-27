import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
const user="11111111-1111-4111-8111-111111111111", person="22222222-2222-4222-8222-222222222222", fund="33333333-3333-4333-8333-333333333333", investment="44444444-4444-4444-8444-444444444444", old="55555555-5555-4555-8555-555555555555", other="66666666-6666-4666-8666-666666666666";
let db:PGlite;
describe("separate investment application transaction",()=>{
  beforeAll(async()=>{
    db=new PGlite();
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.user',true),'')::uuid $$;
      create table user_roles(user_id uuid,role text);
      create table persons(id uuid primary key,merged_into_person_id uuid);
      create table investment_profiles(id uuid,owner_user_id uuid);
      create table investor_applications(id uuid primary key default gen_random_uuid(),user_id uuid,offering_id uuid,source text,current_step text,commitment_cents bigint,kyc_status text default 'not_started',aml_status text default 'not_started');
      create table investor_onboardings(id uuid primary key,investor_user_id uuid,person_id uuid,offering_id uuid,application_id uuid,investment_profile_id uuid,removed_at timestamptz,closed_at timestamptz,stage text,requested_amount_cents bigint,updated_at timestamptz);
      create table investor_record_changes(offering_id uuid,onboarding_id uuid,subject_table text,subject_id uuid,field text,old_value jsonb,new_value jsonb,source text,actor_user_id uuid,manager_visible boolean);`);
    await db.exec(readFileSync('.lovable/drafts/drft_01m5zdmb66efsvwbd4dgkmfpbg/migrations/20261027211000_separate_investment_application.sql','utf8'));
  });
  afterAll(async()=>{await db.close();});
  beforeEach(async()=>{
    await db.exec(`reset role; truncate persons,investment_profiles,investor_applications,investor_onboardings,investor_record_changes,user_roles;
      select set_config('test.user','${user}',false);
      insert into persons values('${person}',null);
      insert into investor_applications(id,user_id,offering_id,commitment_cents,kyc_status,aml_status) values('${old}','${user}','${fund}',250000000,'approved','approved');
      insert into investor_onboardings(id,investor_user_id,person_id,offering_id,stage,requested_amount_cents) values('${investment}','${user}','${person}','${fund}','profile_selected',5000000);`);
  });
  const link=()=>db.query<{id:string}>('select ensure_exact_investment_application($1) as id',[investment]);
  it('creates a separate $50,000 application without borrowing the older $2,500,000 approval',async()=>{
    const id=(await link()).rows[0]?.id; expect(id).not.toBe(old);
    expect((await db.query('select commitment_cents,kyc_status,aml_status from investor_applications where id=$1',[id])).rows[0]).toEqual({commitment_cents:5000000,kyc_status:'not_started',aml_status:'not_started'});
    expect((await db.query('select commitment_cents,kyc_status from investor_applications where id=$1',[old])).rows[0]).toEqual({commitment_cents:250000000,kyc_status:'approved'});
  });
  it('retries reuse only the exact link without duplicate evidence',async()=>{
    expect((await link()).rows[0]?.id).toBe((await link()).rows[0]?.id);
    expect((await db.query('select * from investor_record_changes')).rows).toHaveLength(1);
  });
  it('rejects unrelated accounts',async()=>{
    await db.query("select set_config('test.user',$1,false)",[other]); await expect(link()).rejects.toThrow('authority required');
  });
  it.each(['closed','declined','cancelled'])('preserves %s investments',async(stage)=>{
    await db.query('update investor_onboardings set stage=$1',[stage]); await expect(link()).rejects.toThrow('no longer');
  });
  it('rejects missing investing person',async()=>{
    await db.exec('update investor_onboardings set person_id=null'); await expect(link()).rejects.toThrow('Exact investing person');
  });
  it('rolls back creation and linking if the audit write fails',async()=>{
    await db.exec("alter table investor_record_changes add constraint fake_failure check (field <> 'application_id')");
    try {await expect(link()).rejects.toThrow();expect((await db.query('select application_id from investor_onboardings')).rows[0]).toEqual({application_id:null});expect((await db.query('select * from investor_applications')).rows).toHaveLength(1);}
    finally {await db.exec('alter table investor_record_changes drop constraint fake_failure');}
  });
  it('anonymous callers cannot execute the correction',async()=>{
    await db.exec('set role anon'); await expect(link()).rejects.toThrow('permission denied');
  });
});