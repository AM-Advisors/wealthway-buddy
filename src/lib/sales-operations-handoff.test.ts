import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, afterAll, it, expect } from "vitest";
import { handoffStatus } from "./sales-operations-handoff-model";
let db: PGlite;
const sales = "11111111-1111-4111-8111-111111111111", ops = "22222222-2222-4222-8222-222222222222", other = "33333333-3333-4333-8333-333333333333", quote = "44444444-4444-4444-8444-444444444444", fund = "55555555-5555-4555-8555-555555555555";
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role service_role; create role anon; create role authenticated;
    create table user_roles(user_id uuid,role text); create table sales_reporting_lines(user_id uuid,manager_user_id uuid);
    create table offerings(id uuid primary key, consolidated_into uuid);
    create table sales_quotes(id uuid primary key,status text,onboarded_offering_id uuid,owner_user_id uuid,client_id uuid);
    create table staff_tasks(id uuid primary key default gen_random_uuid(),title text,source text,source_ref text,team text,client_id uuid,offering_id uuid,created_by uuid,related_workflow_type text,related_workflow_id uuid,status text default 'open',assignee_user_id uuid,due_date date,updated_at timestamptz,completed_at timestamptz);
    create unique index task_source on staff_tasks(source,source_ref) where source_ref is not null;
    create table staff_task_events(task_id uuid references staff_tasks(id),actor_user_id uuid,kind text,detail jsonb);`);
  await db.exec(readFileSync("drizzle/migrations/0345_sales_operations_handoff_tasks.sql", "utf8"));
});
beforeEach(async () => {
  await db.exec(`truncate staff_task_events,staff_tasks,sales_quotes,offerings,user_roles;
    insert into user_roles values('${sales}','sales'),('${ops}','operations'),('${other}','operations');
    insert into offerings values('${fund}',null);
    insert into sales_quotes values('${quote}','signed','${fund}','${sales}',null);`);
});
afterAll(async () => db.close());
const save = (actor: string, action: string, owner: string | null = ops, due: string | null = "2026-10-30") => db.query("select save_sales_operations_handoff($1,$2,$3,$4,$5,$6)", [actor,quote,fund,action,owner,due]);
it("stores the receiving owner and exact due date once on repeated assignment", async () => {
  await save(sales,"assign"); await save(sales,"assign");
  expect((await db.query("select assignee_user_id,due_date::text,status from staff_tasks")).rows).toEqual([{assignee_user_id:ops,due_date:"2026-10-30",status:"open"}]);
});
it("requires both receiving owner and due date", async () => { await expect(save(sales,"assign",null)).rejects.toThrow("required"); await expect(save(sales,"assign",ops,null)).rejects.toThrow("required"); });
it("rejects a Sales recipient", async () => { await expect(save(sales,"assign",sales)).rejects.toThrow("Operations owner"); });
it("only the receiving owner acknowledges and completes", async () => {
  await save(sales,"assign"); await expect(save(other,"acknowledge")).rejects.toThrow("Only the receiving");
  await expect(save(ops,"complete")).rejects.toThrow("Acknowledge");
  await save(ops,"acknowledge"); await save(ops,"complete");
  expect((await db.query("select status,completed_at is not null as completed from staff_tasks")).rows).toEqual([{status:"done",completed:true}]);
  expect((await db.query("select count(*)::int as n from staff_task_events")).rows).toEqual([{n:4}]);
});
it("reassignment resets acknowledgment", async () => { await save(sales,"assign"); await save(ops,"acknowledge"); await save(sales,"assign",other); expect((await db.query("select status from staff_tasks")).rows).toEqual([{status:"open"}]); });
it("blocks unrelated Sales and unsigned sources", async () => {
  await db.exec(`update user_roles set role='sales' where user_id='${other}'`);
  await expect(save(other,"assign")).rejects.toThrow("outside your Sales scope");
  await db.exec("update sales_quotes set status='draft'"); await expect(save(sales,"assign")).rejects.toThrow("Signed quote");
});
it("refuses generic task edits and retains completed handoffs", async () => {
  await save(sales,"assign"); await expect(db.exec("update staff_tasks set status='done'")).rejects.toThrow("fund page");
  await save(ops,"acknowledge"); await save(ops,"complete"); await expect(save(sales,"assign")).rejects.toThrow("retained");
});
it("projects overdue separately and never fabricates acknowledgment", () => {
  expect(handoffStatus({status:"open",ownerId:ops,dueDate:"2026-10-26"},"2026-10-27")).toEqual({label:"Awaiting acknowledgment",overdue:true});
  expect(handoffStatus({status:"done",ownerId:ops,dueDate:"2026-10-26"},"2026-10-27").overdue).toBe(false);
});