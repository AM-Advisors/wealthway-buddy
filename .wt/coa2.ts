import { guard, N } from "./lib";
const d = await guard();
const b = await d.from("ledger_books").select("id,offering_id").eq("offering_id", N);
console.log(JSON.stringify(b.data));
const a = await d.from("chart_of_accounts").select("code,name,account_type").eq("book_id", b.data[0].id).order("code");
console.log(JSON.stringify(a.data));
const l = await d.from("fund_liabilities").select("*").eq("offering_id", N); console.log("liab", l.error?.message, JSON.stringify(l.data));
