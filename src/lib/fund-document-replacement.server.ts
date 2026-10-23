import { assertFund, isStaff, db } from '@/lib/fund-tabs.server';
import { uploadDocumentVersion, approveDocumentVersion, saveSigningConfig } from '@/lib/offering-document-setup.server';

/** Explicit staff designation; signing itself never infers a replacement from a name. */
export async function designateFundReplacement(userId: string, fundId: string, fileId: string, documentId: string) {
  await assertFund(userId, fundId);
  if (!await isStaff(userId)) throw new Error('Only Harmonious can designate replacement agreements.');
  const d = await db();
  const { data: previous, error: previousError } = await d.from('fund_document_replacements').select('version,promoted_at').eq('file_id', fileId).maybeSingle();
  if (previousError) throw new Error(previousError.message);
  if (previous) return { version: previous.version, promoted: Boolean(previous.promoted_at) };
  const [{ data: f, error: fe }, { data: doc, error: de }] = await Promise.all([
    d.from('fund_files').select('id,status,storage_path,file_name,size_bytes,content_type,template_key,signing_order').eq('id', fileId).eq('offering_id', fundId).is('deleted_at', null).maybeSingle(),
    d.from('offering_documents').select('id,active_version,current_version,document_category,usage').eq('id', documentId).eq('offering_id', fundId).is('removed_at', null).maybeSingle(),
  ]);
  if (fe || de || !f || !doc) throw new Error('Agreement not found in this fund.');
  if (f.template_key !== 'operating_agreement' || doc.document_category !== 'operating_agreement' || f.signing_order !== 'manager_only') throw new Error('Choose a fund-signatory-only Operating Agreement replacement.');
  if (!f.storage_path || f.content_type !== 'application/pdf') throw new Error('Upload the exact PDF agreement first.');
  if (!doc.active_version || doc.current_version !== doc.active_version) throw new Error('Resolve the existing inactive replacement before designating another.');
  const { data: active, error: ae } = await d.from('offering_document_versions').select('signing_config,signing_config_status').eq('offering_document_id', doc.id).eq('version', doc.active_version).maybeSingle();
  if (ae || active?.signing_config_status !== 'confirmed' || !active.signing_config) throw new Error('Confirm the current agreement signing setup first.');
  const signers = active.signing_config.signers;
  if (!Array.isArray(signers) || !signers.length || signers.some((s: { role: string }) => s.role !== 'fund_signatory')) throw new Error('This replacement must use fund-signatory-only signing.');
  const { data: blob, error: downloadError } = await d.storage.from('manager-uploads').download(f.storage_path);
  if (downloadError || !blob) throw new Error('The exact agreement could not be read.');
  const path = `${fundId}/signed-replacements/${fileId}/${f.file_name}`;
  const { error: copyError } = await d.storage.from('offering-files').upload(path, blob, { contentType: 'application/pdf', upsert: false });
  if (copyError) throw new Error('The replacement copy could not be stored.');
  const { version } = await uploadDocumentVersion(userId, { documentId, filePath: path, fileName: f.file_name, fileSizeBytes: blob.size });
  await approveDocumentVersion(userId, { documentId, version });
  await saveSigningConfig(userId, { documentId, version, config: active.signing_config, confirm: true });
  const { error } = await d.from('fund_document_replacements').insert({ file_id: fileId, offering_document_id: documentId, version, expected_active_version: doc.active_version, designated_by: userId });
  if (error) throw new Error('The new version was prepared but automatic publication could not be designated.');
  const { data: state, error: stateError } = await d.from('fund_document_replacements').select('promoted_at').eq('file_id', fileId).single();
  if (stateError) throw new Error('The replacement was saved but its publication status could not be read.');
  return { version, promoted: Boolean(state?.promoted_at) };
}