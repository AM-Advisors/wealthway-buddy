import { guard, N, U } from "/dev-server/.wt/lib";
const d = await guard();
const r = await d.from("bank_accounts").insert({ offering_id: N, institution_name: "DEMO Synthetic Bank (not real)", account_name: "Walkthrough DEMO operating", account_mask: "DEMO", status: "active", created_by: U.prep }).select("id"); console.log(JSON.stringify(r));
