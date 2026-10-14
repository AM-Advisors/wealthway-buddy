const { providerFor } = await import("@/lib/document-providers.server");
const p = providerFor({ provider: "box", connection_reference: "box-shared:https://app.box.com/s/93lnemz597wwwdco5sdkrytbv3w4xcvy", allowed_root_ids: ["391643680676"] });
const f = await p.getContent("2294300426293");
console.log("ok", f.bytes.length, f.name.slice(0, 20));
try { await providerFor({ provider: "box", connection_reference: "box-shared:https://app.box.com/s/93lnemz597wwwdco5sdkrytbv3w4xcvy", allowed_root_ids: ["999"] }).getContent("2294300426293"); console.log("BAD: out of scope allowed"); } catch (e) { console.log("blocked:", (e as Error).message); }
process.exit(0);
