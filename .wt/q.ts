import { guard } from "/dev-server/.wt/lib";
const d = await guard();
const r = await d.from("portfolio_valuations").select("*").limit(1); console.log(Object.keys(r.data?.[0]??{}).join(","));
