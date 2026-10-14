const { providerFor } = await import("@/lib/document-providers.server");
const ref = "box-shared:https://app.box.com/s/93lnemz597wwwdco5sdkrytbv3w4xcvy";
const f = await providerFor({ provider: "box", connection_reference: ref, allowed_root_ids: ["391643680676"] }).getContent("2294300426293");
console.log("ok", f.bytes.length);
try { await providerFor({ provider: "box", connection_reference: ref, allowed_root_ids: ["999"] }).getContent("2294300426293"); console.log("BAD"); } catch (e) { console.log("blocked:", (e as Error).message); }
process.exit(0);
