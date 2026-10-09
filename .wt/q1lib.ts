import { appendFileSync } from "node:fs";
import { guard, U, N, BATCH } from "./lib";
import { trialBalance } from "@/lib/ledger-trial-balance";
export const d = await guard();
export const BOOK = (await d.from("ledger_books").select("id").eq("offering_id", N).single()).data.id as string;
export async function grant() { for (const [k, uid] of Object.entries(U)) { await d.from("user_roles").upsert({ user_id: uid, role: "admin" }, { onConflict: "user_id,role", ignoreDuplicates: true }); appendFileSync("/tmp/wt/grants.jsonl", JSON.stringify({ account: k, role: "admin", purpose: `${BATCH} Q1 execution (temporary)`, grantedAt: new Date().toISOString() }) + "\n"); } }
export async function revoke() { for (const uid of Object.values(U)) await d.from("user_roles").delete().eq("user_id", uid).in("role", ["admin", "operations"]); const left = (await d.from("user_roles").select("role").in("user_id", Object.values(U))).data; appendFileSync("/tmp/wt/grants.jsonl", JSON.stringify({ revokedAt: new Date().toISOString() }) + "\n"); console.log("ACCESS removed; remaining", JSON.stringify(left)); }
export async function tb() {
  const a = (await d.from("chart_of_accounts").select("id,code,name,account_type,normal_balance,subtype").eq("book_id", BOOK)).data;
  const l = (await d.from("journal_lines").select("account_id,debit_cents,credit_cents,journal_entries!inner(status,book_id)").eq("journal_entries.book_id", BOOK).eq("journal_entries.status", "posted")).data;
  return trialBalance(a, l);
}
export const bal = (t: any, c: string) => t.rows.find((r: any) => r.code === c)?.balanceCents ?? 0;
export async function jeCount() { return (await d.from("journal_entries").select("id", { count: "exact", head: true }).eq("book_id", BOOK)).count; }
