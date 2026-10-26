import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { uploadDocumentVersion, saveSigningConfig } from "@/lib/offering-document-setup.server";
import { fillDocx } from "@/lib/docx-autofill";
import { fundTemplateValues, templateSigningConfig } from "@/lib/fund-doc-templates.server";
import { writeFileSync } from "fs";
const db = supabaseAdmin as any, A = "fcf83359-0486-402d-83b4-fd5484fb663d", F = "92252b98-c5d2-444a-8620-fb29436a87cf";
const jobs = [
  { doc: "aee9a7c8-458e-4d22-9182-36a96929b9ef", tpl: "d0659664-98b3-4500-a161-0e2206b30ed8", key: "ppm" },
  { doc: "7a6b7f9a-fe10-45b0-ae78-3bf1b28ee2c0", tpl: "b042bb64-12c3-4951-8af7-206b47fca361", key: "sub" },
];
const values = await fundTemplateValues(F);
for (const j of jobs) {
  const { data: t } = await db.from("document_templates").select("*").eq("id", j.tpl).single();
  const { data: v } = await db.from("document_template_versions").select("*").eq("template_id", j.tpl).eq("version", 1).single();
  const { data: blob } = await supabaseAdmin.storage.from("offering-files").download(v.file_path);
  const r = await fillDocx(new Uint8Array(await blob!.arrayBuffer()), values);
  let bytes = r.bytes;
  // black text only: strip inherited red font colors (wording unchanged)
  const JSZip = (await import("jszip")).default; const z = await JSZip.loadAsync(bytes);
  for (const n of Object.keys(z.files).filter(n => /^word\/.*\.xml$/.test(n))) {
    const x = await z.file(n)!.async("string"); const y = x.replace(/<w:color w:val="(FF0000|C00000|E00000|FF3333)"[^>]*\/>/gi, "");
    if (x !== y) z.file(n, y);
  }
  bytes = new Uint8Array(await z.generateAsync({ type: "uint8array" }));
  writeFileSync(`/tmp/laasy/${j.key}.docx`, bytes);
  const dest = `${F}/templates/${j.tpl}-v1-${Date.now()}-${v.file_name.replace(/[^\w.-]/g, "_")}`;
  const up = await supabaseAdmin.storage.from("offering-files").upload(dest, bytes, { contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
  if (up.error) throw up.error;
  const { version } = await uploadDocumentVersion(A, { documentId: j.doc, filePath: dest, fileName: v.file_name, fileSizeBytes: bytes.length });
  await db.from("document_template_uses").insert({ template_id: j.tpl, template_version: 1, offering_id: F, offering_document_id: j.doc, fund_version: version, used_by: A });
  const cfg = templateSigningConfig(t.category, t.title);
  if (cfg) await saveSigningConfig(A, { documentId: j.doc, version, confirm: true, config: cfg });
  console.log(j.key, "v" + version, "open:", JSON.stringify(r.open));
}
