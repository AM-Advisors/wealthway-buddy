import { guard } from "./lib"; const d = await guard();
const { data: b } = await d.from("ledger_books").select("*").eq("offering_id", "4014f341-8d38-4afc-9c18-ee21f8ae9224");
console.log(JSON.stringify(b));
const { data } = await d.from("ledger_accounts").select("id,code,name,account_type,subtype").eq("book_id", b[0].id).order("code");
console.log(JSON.stringify(data));
