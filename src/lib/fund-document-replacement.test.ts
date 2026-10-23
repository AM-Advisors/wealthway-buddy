import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';

const fund = '11111111-1111-4111-8111-111111111111';
const file = '22222222-2222-4222-8222-222222222222';
const doc = '33333333-3333-4333-8333-333333333333';
const actor = '44444444-4444-4444-8444-444444444444';
let db: PGlite;
const promote = () => db.query('select public.promote_signed_fund_replacement($1) as promoted', [file]);
describe('signed replacement publication (fictional offline transaction)', () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create table fund_files(id uuid primary key,offering_id uuid,status text,deleted_at timestamptz,template_key text);
      create table fund_file_signatures(file_id uuid,status text,signed_at timestamptz,signer_role text,onboarding_id uuid);
      create table offering_documents(id uuid primary key,offering_id uuid,removed_at timestamptz,document_category text,active_version int,signature_template_version int,file_path text,file_name text,file_size_bytes bigint);
      create table offering_document_versions(id uuid default gen_random_uuid(),offering_document_id uuid,offering_id uuid,version int,approval_status text,signing_config_status text,superseded_at timestamptz,file_path text,file_name text,file_size_bytes bigint,rollout_scope text,target_onboarding_id uuid,rolled_out_by uuid,rolled_out_at timestamptz,rollout_note text,unique(offering_document_id,version));
      create table offering_document_events(offering_id uuid,offering_document_id uuid,version int,event text,actor_user_id uuid,detail jsonb);
      create table retained_investor_copy(version int,file_path text);
    `);
    await db.exec(readFileSync('drizzle/migrations/0337_signed_fund_replacement_publication.sql', 'utf8'));
  });
  afterAll(async () => db.close());
  beforeEach(async () => {
    await db.exec(`reset role; truncate fund_document_replacements,fund_files,offering_documents,offering_document_versions,fund_file_signatures,offering_document_events,retained_investor_copy cascade;
      insert into fund_files values('${file}','${fund}','out_for_signature',null,'operating_agreement');
      insert into offering_documents(id,offering_id,document_category,active_version) values('${doc}','${fund}','operating_agreement',1);
      insert into offering_document_versions(offering_document_id,offering_id,version,approval_status,signing_config_status,file_path,file_name) values('${doc}','${fund}',1,'approved','confirmed','old.pdf','old.pdf'),('${doc}','${fund}',2,'approved','confirmed','new.pdf','new.pdf');
      insert into fund_file_signatures values('${file}','sent',null,'fund_manager',null);
      insert into retained_investor_copy values(1,'old.pdf');
      insert into fund_document_replacements(file_id,offering_document_id,version,expected_active_version,designated_by) values('${file}','${doc}',2,1,'${actor}');`);
  });
  const complete = async () => db.exec(`update fund_file_signatures set status='signed',signed_at=now(); update fund_files set status='signed';`);
  it('automatically makes the designated complete agreement main for new investors', async () => {
    await complete();
    expect((await db.query('select active_version,file_path from offering_documents')).rows).toEqual([{active_version:2,file_path:'new.pdf'}]);
    expect((await db.query('select rollout_scope from offering_document_versions where version=2')).rows).toEqual([{rollout_scope:'new_only'}]);
  });
  it('retains previous investor copies and version history', async () => {
    await complete();
    expect((await db.query('select * from retained_investor_copy')).rows).toEqual([{version:1,file_path:'old.pdf'}]);
    expect((await db.query('select approval_status,file_path from offering_document_versions where version=1')).rows).toEqual([{approval_status:'superseded',file_path:'old.pdf'}]);
  });
  it('does not promote when another signature remains incomplete', async () => {
    await db.exec(`insert into fund_file_signatures values('${file}','sent',null,'fund_manager',null); update fund_file_signatures set status='signed',signed_at=now() where ctid=(select min(ctid) from fund_file_signatures); update fund_files set status='signed';`);
    expect((await promote()).rows).toEqual([{promoted:false}]);
    expect((await db.query('select active_version from offering_documents')).rows).toEqual([{active_version:1}]);
  });
  it('ignores cancelled signing requests', async () => {
    await db.exec(`insert into fund_file_signatures values('${file}','cancelled',null,'fund_manager',null); update fund_file_signatures set status='signed',signed_at=now() where status='sent'; update fund_files set status='signed';`);
    expect((await db.query('select active_version from offering_documents')).rows).toEqual([{active_version:2}]);
  });
  it('cannot publish an undesignated file', async () => {
    await db.exec('delete from fund_document_replacements'); await complete();
    expect((await db.query('select active_version from offering_documents')).rows).toEqual([{active_version:1}]);
  });
  it('does not overwrite a newer main version', async () => {
    await db.exec('update offering_documents set active_version=3'); await complete();
    expect((await db.query('select active_version from offering_documents')).rows).toEqual([{active_version:3}]);
  });
  it('requires approval and confirmed signing setup', async () => {
    await db.exec("update offering_document_versions set approval_status='uploaded_review_required' where version=2"); await complete();
    expect((await promote()).rows).toEqual([{promoted:false}]);
    await db.exec("update offering_document_versions set approval_status='approved',signing_config_status='needs_review' where version=2");
    expect((await promote()).rows).toEqual([{promoted:false}]);
  });
  it('never publishes investor-specific packets as fund replacements', async () => {
    await db.exec("update fund_file_signatures set signer_role='investor'"); await complete();
    expect((await promote()).rows).toEqual([{promoted:false}]);
  });
  it('retries do not duplicate activation events', async () => {
    await complete(); await promote(); await promote();
    expect((await db.query("select count(*)::int as n from offering_document_events where event='version_activated'")).rows).toEqual([{n:1}]);
  });
  it('anonymous and ordinary authenticated callers cannot invoke privileged promotion', async () => {
    await db.exec('set role authenticated'); await expect(promote()).rejects.toThrow(/permission denied/);
    await db.exec('set role anon'); await expect(promote()).rejects.toThrow(/permission denied/);
  });
});