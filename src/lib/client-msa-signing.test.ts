import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

const user = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const client = '33333333-3333-4333-8333-333333333333';
const version = '44444444-4444-4444-8444-444444444444';
const old = '55555555-5555-4555-8555-555555555555';
let db: PGlite;
const sql = () => readFileSync('drizzle/migrations/0336_client_msa_signing_transaction.sql', 'utf8');
const sign = (v = version, title = 'Managing Partner') => db.query<{ result: { newSignature: boolean; alreadyExecuted: boolean } }>(
  `select public.sign_client_msa($1,$2,'Jane Doe',$3,'Jane Doe') as result`, [client, v, title]);

describe('atomic client MSA ceremony (fictional offline database)', () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      create role authenticated; create role anon; create schema auth;
      create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.user',true),'')::uuid $$;
      create function auth.jwt() returns jsonb language sql as $$ select jsonb_build_object('email','jane@example.com') $$;
      create table clients(id uuid primary key, msa_signer_user_id uuid);
      create table client_users(client_id uuid,user_id uuid);
      create table offerings(id uuid primary key,client_id uuid);
      create table fund_managers(offering_id uuid,user_id uuid);
      create table msa_versions(id uuid primary key,version text,status text,effective_date date);
      create table client_msa_agreements(id uuid primary key default gen_random_uuid(),client_id uuid,msa_version_id uuid,
        status text,client_approved_at timestamptz,executed_at timestamptz,unique(client_id,msa_version_id));
      create table agreement_signatures(id uuid default gen_random_uuid(),scope text,client_id uuid,msa_agreement_id uuid,
        side text,company text,signer_name text,signer_title text,signer_email text,signer_user_id uuid,typed_signature text,
        version_label text,signature_image text,signature_method text);
      alter table client_msa_agreements enable row level security;
      grant insert on client_msa_agreements to authenticated;
    `);
    await db.exec(sql());
  });
  afterAll(async () => { await db.close(); });
  beforeEach(async () => {
    await db.exec(`reset role; truncate clients,client_users,offerings,fund_managers,msa_versions,client_msa_agreements,agreement_signatures;
      insert into clients values ('${client}', '${user}'); insert into client_users values ('${client}','${user}');
      insert into msa_versions values ('${version}','v2','published','2026-10-22'),('${old}','v1','draft','2026-01-01');
      select set_config('test.user','${user}',false);`);
  });
  it('reproduces first-row RLS rejection without the ceremony', async () => {
    await db.exec('set role authenticated');
    await expect(db.query(`insert into client_msa_agreements(client_id,msa_version_id,status) values ($1,$2,'in_review')`, [client,version])).rejects.toThrow(/row-level security/);
  });
  it('saves first signature and client_signed but never executed under authenticated role', async () => {
    await db.exec('set role authenticated');
    expect((await sign()).rows[0]?.result.newSignature).toBe(true);
    await db.exec('reset role');
    expect((await db.query('select status,executed_at from client_msa_agreements')).rows).toEqual([{status:'client_signed',executed_at:null}]);
    expect((await db.query('select signer_user_id,signer_title,signer_email,side from agreement_signatures')).rows).toEqual([{signer_user_id:user,signer_title:'Managing Partner',signer_email:'jane@example.com',side:'client'}]);
  });
  it('rejects unrelated users even when they can call the function', async () => {
    await db.query(`select set_config('test.user',$1,false)`,[other]);
    await db.exec('set role authenticated');
    await expect(sign()).rejects.toThrow(/another client/);
  });
  it('rejects wrong designated signers even with membership', async () => {
    await db.query('insert into client_users values ($1,$2)',[client,other]);
    await db.query(`select set_config('test.user',$1,false)`,[other]);
    await expect(sign()).rejects.toThrow(/assigned to sign/);
  });
  it('permits the exact client fund manager without a client_users row', async () => {
    await db.exec(`delete from client_users; insert into offerings values ('${old}','${client}'); insert into fund_managers values ('${old}','${user}')`);
    expect((await sign()).rows[0]?.result.newSignature).toBe(true);
  });
  it('rejects old or unpublished versions', async () => { await expect(sign(old)).rejects.toThrow(/current version/); });
  it('requires a recorded signing title', async () => { await expect(sign(version,' ')).rejects.toThrow(/signing title/); });
  it('retries do not duplicate or replace a client signature', async () => {
    await sign(); expect((await sign()).rows[0]?.result.newSignature).toBe(false);
    expect((await db.query('select count(*)::int as n from agreement_signatures')).rows).toEqual([{n:1}]);
  });
  it('does not alter an executed agreement', async () => {
    await sign(); await db.exec(`update client_msa_agreements set status='executed',executed_at='2026-10-22'`);
    expect((await sign()).rows[0]?.result.alreadyExecuted).toBe(true);
    expect((await db.query('select status from client_msa_agreements')).rows).toEqual([{status:'executed'}]);
  });
  it('rolls back the agreement row when signature storage fails', async () => {
    await db.exec(`alter table agreement_signatures add constraint fake_failure check (signer_name <> 'Jane Doe')`);
    try {
      await expect(sign()).rejects.toThrow(/fake_failure/);
      expect((await db.query('select count(*)::int as n from client_msa_agreements')).rows).toEqual([{n:0}]);
    } finally { await db.exec('alter table agreement_signatures drop constraint fake_failure'); }
  });
  it('anonymous callers cannot execute the ceremony', async () => {
    await db.exec('set role anon'); await expect(sign()).rejects.toThrow(/permission denied/);
  });
});