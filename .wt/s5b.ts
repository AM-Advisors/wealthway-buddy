import { guard, U, N } from "./lib";
const d = await guard();
const { data: ev } = await d.from("commitment_events").select("event_type,amount_cents").eq("offering_id", N);
const sum = (t: string) => ev.filter((e: any) => e.event_type === t).reduce((s: number, e: any) => s + Number(e.amount_cents), 0) / 100;
console.log("commit", sum("original_commitment"), "called", sum("capital_call"), "contributed", sum("contribution"));
for (const uid of Object.values(U)) { const { error } = await d.from("user_roles").delete().eq("user_id", uid).in("role", ["admin", "operations"]); console.log("revoked", error?.message ?? "ok"); }
