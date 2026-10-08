import { guard, N } from "./lib";
const d = await guard();
const { data } = await d.from("portfolio_valuations").select("id,asset_id,status,journal_entry_id,recognized_by_journal_id,valuation_date").eq("offering_id", N);
console.log(JSON.stringify(data));
