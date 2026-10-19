import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { uploadOnboardingDocForFn } from '@/lib/investor-extras.functions';

const KINDS = [['identification', 'Government ID'], ['proof_of_address', 'Proof of address'], ['accreditation_proof', 'Accreditation proof'], ['entity_formation', 'Entity formation documents'], ['operating_agreement', 'Operating or trust agreement'], ['ownership_list', 'Owner list'], ['tax_form', 'Signed W-9 or W-8']] as const;

/** Manager/Harmonious upload on the investor's behalf. Uploading never verifies anyone. */
export function UploadForInvestor({ onboardingId }: { onboardingId: string }) {
  const upload = useServerFn(uploadOnboardingDocForFn), qc = useQueryClient();
  const [kind, setKind] = useState<(typeof KINDS)[number][0]>('identification'), [file, setFile] = useState<File | null>(null), [busy, setBusy] = useState(false);
  const send = async () => {
    if (!file) return; setBusy(true);
    try {
      const buf = new Uint8Array(await file.arrayBuffer()); let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      await upload({ data: { onboardingId, kind, fileName: file.name, contentType: file.type, base64: btoa(bin) } });
      toast.success('Document added for the investor'); setFile(null); qc.invalidateQueries();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Card><CardHeader><CardTitle className="text-base">Add a document for this investor</CardTitle><p className="text-xs text-muted-foreground">Kept as the original and reviewed by Harmonious. Uploading doesn't verify identity — that still runs through the identity check.</p></CardHeader>
      <CardContent className="flex flex-wrap items-center gap-2 text-sm">
        <select aria-label="Document type" className="h-9 rounded-md border bg-background px-2" value={kind} onChange={(e) => setKind(e.target.value as any)}>{KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <input aria-label="File" type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <Button size="sm" disabled={!file || busy} onClick={send}>{busy ? 'Uploading…' : 'Upload'}</Button>
      </CardContent></Card>
  );
}
