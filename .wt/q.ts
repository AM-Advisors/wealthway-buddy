import { guard, N } from "/dev-server/.wt/lib";
const d = await guard();
for (const t of ["portfolio_assets","portfolio_positions","portfolio_investments","investments","portfolio_transactions","asset_valuations","fund_expenses","expenses"]) {
  const r = await d.from(t).select("*", { count: "exact", head: true }).eq("offering_id", N);
  console.log(t, r.error ? "ERR " + r.error.message.slice(0,60) : r.count);
}
