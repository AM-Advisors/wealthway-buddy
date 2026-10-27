import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const request = "11111111-1111-4111-8111-111111111111";
const task = "22222222-2222-4222-8222-222222222222";
const review = "33333333-3333-4333-8333-333333333333";
const fund = "44444444-4444-4444-8444-444444444444";
const owner = "55555555-5555-4555-8555-555555555555";
let db: PGlite;
describe("fictional request and primary task routing transactions", () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`create role service_role; create role anon; create role authenticated;
      create table staff_tasks(id uuid primary key,offering_id uuid,related_workflow_type text,related_workflow_id uuid,source_ref text,assignee_user_id uuid,team text,due_date date,status text default 'open',updated_at timestamptz);
      create table fund_service_requests(id uuid primary key,fund_id uuid,task_id uuid references staff_tasks(id),review_task_id uuid references staff_tasks(id),assigned_to uuid,assigned_team text,due_date date,status text default 'READY_FOR_APPROVAL',updated_at timestamptz);
      create table staff_task_events(task_id uuid,actor_user_id uuid,kind text,detail jsonb);
      create table fund_request_events(request_id uuid,fund_id uuid,actor_user_id uuid,kind text,client_visible boolean,detail jsonb);`);
    await db.exec(readFileSync("drizzle/migrations/0346_fund_request_task_routing_sync.sql", "utf8"));
  });
  afterAll(async () => db.close());
  beforeEach(async () => {
    await db.exec(`truncate fund_service_requests,staff_tasks,staff_task_events,fund_request_events;
      insert into staff_tasks(id,offering_id,related_workflow_type,related_workflow_id,source_ref,team) values
      ('${task}','${fund}','fund_service_request','${request}','fund_request:${request}','operations'),
      ('${review}','${fund}','fund_service_request','${request}','fund_request_review:${request}','sales');
      insert into fund_service_requests(id,fund_id,assigned_team,review_task_id) values('${request}','${fund}','investor_operations','${review}');
      update fund_service_requests set task_id='${task}' where id='${request}';`);
  });
  const taskRow = async () => (await db.query("select assignee_user_id::text,team,due_date::text,status from staff_tasks where id=$1", [task])).rows[0];
  const requestRow = async () => (await db.query("select assigned_to::text,assigned_team,due_date::text,status from fund_service_requests where id=$1", [request])).rows[0];
  it("request owner changes reach only the primary task", async () => {
    await db.query("update fund_service_requests set assigned_to=$1 where id=$2", [owner, request]);
    expect(await taskRow()).toMatchObject({ assignee_user_id: owner });
    expect((await db.query("select assignee_user_id from staff_tasks where id=$1", [review])).rows[0]).toEqual({ assignee_user_id: null });
  });
  it("task owner changes reach the request, including unassignment", async () => {
    await db.query("update staff_tasks set assignee_user_id=$1 where id=$2", [owner, task]);
    expect(await requestRow()).toMatchObject({ assigned_to: owner });
    await db.query("update staff_tasks set assignee_user_id=null where id=$1", [task]);
    expect(await requestRow()).toMatchObject({ assigned_to: null });
  });
  it("request deadlines mirror the task, including clearing", async () => {
    await db.query("update fund_service_requests set due_date='2026-11-15' where id=$1", [request]);
    expect(await taskRow()).toMatchObject({ due_date: "2026-11-15" });
    await db.query("update fund_service_requests set due_date=null where id=$1", [request]);
    expect(await taskRow()).toMatchObject({ due_date: null });
  });
  it("task deadlines mirror the request without changing approval state", async () => {
    await db.query("update staff_tasks set due_date='2026-12-01' where id=$1", [task]);
    expect(await requestRow()).toMatchObject({ due_date: "2026-12-01", status: "READY_FOR_APPROVAL" });
  });
  it("maps request teams and preserves precise subteams on owner edits", async () => {
    await db.query("update fund_service_requests set assigned_team='tax' where id=$1", [request]);
    expect(await taskRow()).toMatchObject({ team: "finance" });
    await db.query("update staff_tasks set assignee_user_id=$1 where id=$2", [owner, task]);
    expect(await requestRow()).toMatchObject({ assigned_team: "tax" });
  });
  it("task team changes route the request to the corresponding department", async () => {
    await db.query("update staff_tasks set team='sales' where id=$1", [task]);
    expect(await requestRow()).toMatchObject({ assigned_team: "account_management" });
  });
  it("review task edits never overwrite primary request routing", async () => {
    await db.query("update staff_tasks set assignee_user_id=$1,due_date='2027-01-01',team='finance' where id=$2", [owner, review]);
    expect(await requestRow()).toMatchObject({ assigned_to: null, assigned_team: "investor_operations", due_date: null });
  });
  it("unsupported receiving teams roll back the entire task edit", async () => {
    await expect(db.query("update staff_tasks set team='marketing',due_date='2027-01-01' where id=$1", [task])).rejects.toThrow("cannot receive");
    expect(await taskRow()).toMatchObject({ team: "operations", due_date: null });
  });
  it("logs one private counterpart event and none on unchanged saves", async () => {
    await db.query("update staff_tasks set assignee_user_id=$1 where id=$2", [owner, task]);
    await db.query("update staff_tasks set assignee_user_id=$1 where id=$2", [owner, task]);
    expect((await db.query("select kind,client_visible from fund_request_events")).rows).toEqual([{ kind: "task_routing_sync", client_visible: false }]);
  });
  it("refuses mismatched fund links without changing either row", async () => {
    await db.query("update staff_tasks set offering_id=null where id=$1", [task]);
    await expect(db.query("update fund_service_requests set due_date='2027-01-01' where id=$1", [request])).rejects.toThrow("link does not match");
    expect(await requestRow()).toMatchObject({ due_date: null });
  });
});