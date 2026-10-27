import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
let db: PGlite;
const actor = "11111111-1111-4111-8111-111111111111";
describe("fictional atomic cross-source matching", () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`create role anon;create role authenticated;create role service_role;
    create table user_roles(user_id uuid,role text);
    create table crm_contacts(id uuid primary key default gen_random_uuid(),full_name text,email text,phone text,organization text,title text,tags text[],scope text,owner_user_id uuid,created_by uuid,source text,consent text,external_source text,external_id text,archived_at timestamptz,created_at timestamptz default now());
    create table crm_contact_source_links(contact_id uuid,external_source text,external_id text,actor_id uuid,unique(external_source,external_id));
    create table crm_import_match_reviews(external_source text,external_id text,email text,unique(external_source,external_id));
    insert into user_roles values('${actor}','marketing_manager');`);
    await db.exec(readFileSync("drizzle/migrations/0348_match_imported_crm_contacts.sql", "utf8"));
  });
  afterAll(async () => db.close());
  it("ClickUp and HubSpot retain two source links to one contact", async () => {
    const call = async (source: string) => (await db.query<{ result: { contactId: string } }>("select match_imported_crm_contact($1,$2,$3,$4::jsonb) as result", [actor, source, "source-1", JSON.stringify({ full_name: "Fictional Contact", email: " CONTACT@example.test " })])).rows[0]?.result;
    const first = await call("clickup"), second = await call("hubspot");
    expect(first?.contactId).toBeTruthy();
    expect(second?.contactId).toBe(first?.contactId);
    await call("hubspot");
    expect((await db.query("select count(*)::int as n from crm_contacts")).rows[0]).toEqual({ n: 1 });
    expect((await db.query("select count(*)::int as n from crm_contact_source_links")).rows[0]).toEqual({ n: 2 });
  });
  it("another owner stays a review without a duplicate or new access", async () => {
    const other = "22222222-2222-4222-8222-222222222222";
    await db.query("insert into user_roles values($1,'marketing_manager')", [other]);
    const result = await db.query("select match_imported_crm_contact($1,'hubspot','other-source',$2::jsonb) as result", [other, JSON.stringify({ email: "contact@example.test" })]);
    expect(result.rows[0]).toEqual({ result: { kind: "review", contactId: null } });
    expect((await db.query("select count(*)::int as n from crm_contacts")).rows[0]).toEqual({ n: 1 });
  });
});