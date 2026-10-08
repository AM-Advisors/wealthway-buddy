import { guard } from "/dev-server/.wt/lib";
const d = await guard();
const { data } = await d.from("chart_of_accounts").select("code,name,account_type").eq("book_id","d1fd4e89-8028-4aec-b0a6-9901e48efe03").order("code"); console.log(data.map((a:any)=>a.code+" "+a.name+" "+a.account_type).join("\n"));
