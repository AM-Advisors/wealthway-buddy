-- Real evidence documents (SOC 2 reports, ISO 27001 certificates, GDPR policies) uploaded by Harmonious staff.
-- Files live in the private compliance-evidence bucket; compliance_evidence.file_path points at the object.

ALTER TABLE public.compliance_evidence ADD COLUMN IF NOT EXISTS file_path text;

-- Staff only: upload and read evidence files under evidence/.
CREATE POLICY "staff manage compliance evidence documents"
ON storage.objects FOR ALL TO authenticated
USING (
  bucket_id = 'compliance-evidence'
  AND (storage.foldername(name))[1] = 'evidence'
  AND private.is_staff(auth.uid())
)
WITH CHECK (
  bucket_id = 'compliance-evidence'
  AND (storage.foldername(name))[1] = 'evidence'
  AND private.is_staff(auth.uid())
);