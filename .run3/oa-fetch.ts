import { supabaseAdmin } from "@/integrations/supabase/client.server";
const files = [
  ["laasy.docx", "92252b98-c5d2-444a-8620-fb29436a87cf/templates/88ba9e2c-09fd-4f3a-bb8d-9ff025e3bfbc-v1-1793044416970-LLOA_Template.docx"],
  ["erebor-v7.pdf", "fa5ff8b9-e69e-40b9-b9dc-5c6f54d6c88f/signed-replacements/5585a2cc-6678-44bf-b2bf-d443de32a571/Erebor_Operating_Agreement_Thomas_v9.pdf"],
] as const;
for (const [name, path] of files) {
  const { data, error } = await supabaseAdmin.storage.from("offering-files").download(path);
  if (error || !data) { console.log(name, "ERROR", error?.message); continue; }
  await Bun.write(`/tmp/oa/${name}`, Buffer.from(await data.arrayBuffer()));
  console.log(name, "ok", data.size);
}
