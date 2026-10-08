import { guard, N } from "/dev-server/.wt/lib";
const d = await guard();
const r = await d.from("bank_accounts").select("*").limit(1); console.log(r.error?.message, Object.keys(r.data?.[0]??{}).join(","));
const t = await d.from("bank_transactions").select("bank_account_id,plaid_transaction_id,direction,dedupe_key").not("bank_account_id","is",null).limit(2); console.log(JSON.stringify(t.data));
