import { guard } from "/dev-server/.wt/lib";
const d = await guard();
const r = await d.from("portfolio_valuations").update({ recognized_by_journal_id: "503ad832-e33d-44d8-8d0b-5b20dbd51cb3", journal_entry_id: null }).eq("id", "08b80ce6-c45e-4215-bfbb-54b6964ee596").select("id,journal_entry_id,recognized_by_journal_id");
console.log(JSON.stringify(r.error ?? r.data));
