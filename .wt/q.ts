import { guard } from "/dev-server/.wt/lib";
const d = await guard();
for (const t of ["portfolio_assets","asset_valuations"]) { const r = await d.from(t).select("*").limit(1); console.log(t, Object.keys(r.data?.[0]??{}).join(",")); }
