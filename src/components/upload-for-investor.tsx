import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ApprovalButton } from '@/components/approval-button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { uploadOnboardingDocForFn, managerUploadReviewsFn, managerUploadUrlFn, managerReviewUploadFn, completeTaxFormOutsideFn, completeVerificationOutsideFn } from '@/lib/investor-extras.functions';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';

const KINDS = [['identification', 'Government ID'], ['proof_of_address', 'Proof of address'], ['accreditation_proof', 'Accreditation proof'], ['entity_formation', 'Entity formation documents'], ['operating_agreement', 'Operating or trust agreement'], ['ownership_list', 'Owner list'], ['tax_form', 'Signed W-9 or W-8']] as const;

/** Manager/Harmonious upload on the investor's behalf. Uploading never verifies anyone. */
export function UploadForInvestor({ onboardingId }: { onboardingId: string }) {
  const upload = useServerFn(uploadOnboardingDocForFn), qc = useQueryClient();
  const load = useServerFn(managerUploadReviewsFn), open = useServerFn(managerUploadUrlFn), review = useServerFn(managerReviewUploadFn), completeOutside = useServerFn(completeTaxFormOutsideFn), verifyOutside = useServerFn(completeVerificationOutsideFn);
  const [verifying, setVerifying] = useState<string | null>(null), [vf, setVf] = useState({ provider: '', checkedOn: '', reference: '', note: '' });
  const saveVerify = async (id: string) => { setBusy(true); try { await verifyOutside({ data: { id, ...vf, reference: vf.reference || null } }); toast.success('Identity and screening marked approved'); setVerifying(null); await qc.invalidateQueries(); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); } };
  const q = useQuery({ queryKey: ['manager-upload-reviews', onboardingId], queryFn: () => load({ data: { onboardingId } }) });
  const [reviewing, setReviewing] = useState<string | null>(null), [note, setNote] = useState('');
  const decide = async (id: string, status: 'accepted' | 'needs_followup') => {
    setBusy(true);
    try { await review({ data: { id, status, note } }); toast.success(status === 'accepted' ? 'Document approved' : 'More information requested'); setReviewing(null); setNote(''); await qc.invalidateQueries(); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  const [kind, setKind] = useState<(typeof KINDS)[number][0]>('tax_form'), [file, setFile] = useState<File | null>(null), [busy, setBusy] = useState(false);
  const send = async () => {
    if (!file) return; setBusy(true);
    try {
      const buf = new Uint8Array(await file.arrayBuffer()); let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      await upload({ data: { onboardingId, kind, fileName: file.name, contentType: file.type, base64: btoa(bin) } });
      toast.success('Document added for the investor'); setFile(null); qc.invalidateQueries();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Card><CardHeader><CardTitle className="text-xl">Investor documents &amp; tax forms</CardTitle></CardHeader>
      <CardContent className="flex flex-wrap items-center gap-2 text-sm">
        <select aria-label="Document type" className="h-9 rounded-md border bg-background px-2" value={kind} onChange={(e) => setKind(e.target.value as any)}>{KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <input aria-label="File" type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <Button size="sm" disabled={!file || busy} onClick={send}>{busy ? 'Uploading…' : 'Upload'}</Button>
      </CardContent>
      <CardContent className="space-y-3">
        {q.isPending && <p className="text-sm text-muted-foreground">Loading documents…</p>}
        {q.isError && <p role="alert" className="text-sm text-destructive">Documents could not be loaded.</p>}
        <ul className="divide-y">{q.data?.map((row: { id: string; fileName: string; kind: string; status: string; note: string | null; canReview: boolean }) => <li key={row.id} className="space-y-2 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2"><p className="min-w-0 break-all text-base font-medium">{row.fileName}</p><Badge variant="outline">{row.status === 'completed_outside' ? 'Completed outside platform' : row.status === 'accepted' ? 'Approved copy' : row.status === 'needs_followup' ? 'More information needed' : 'Awaiting review'}</Badge></div>
          {row.note && <p className="text-sm text-muted-foreground">{row.note}</p>}
          <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={async () => {
            const tab = window.open('about:blank', '_blank');
            try { const result = await open({ data: { onboardingId, id: row.id } }); if (tab) { tab.opener = null; tab.location.href = result.url; } else window.location.assign(result.url); }
            catch (e) { tab?.close(); toast.error((e as Error).message); }
          }}>View document</Button>{row.kind === 'tax_form' && (row.status === 'new' || row.status === 'accepted') && <ApprovalButton title="Mark this tax form completed?" description={`${row.fileName}. Use this when the investor signed this W-9 or W-8 outside the platform. It will count as their completed tax form.`} disabled={busy} onApprove={async () => { setBusy(true); try { await completeOutside({ data: { id: row.id } }); toast.success('Tax form marked completed'); await qc.invalidateQueries(); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); } }}>Mark completed outside platform</ApprovalButton>}{row.kind === 'identification' && (row.status === 'new' || row.status === 'accepted') && <Button size="sm" disabled={busy} onClick={() => { setVerifying(row.id); setVf({ provider: '', checkedOn: '', reference: '', note: '' }); }}>Mark verification completed outside platform</Button>}{row.canReview && <Button size="sm" disabled={busy} onClick={() => { setReviewing(row.id); setNote(''); }}>Review</Button>}</div>
          {verifying === row.id && <div className="space-y-3 border-t pt-3">
            <p className="text-sm text-muted-foreground">Use this when identity and screening were done by another provider. Saving marks identity (KYC) and screening (AML) approved for this investor and keeps this file as proof. Harmonious compliance staff only.</p>
            <input aria-label="Provider" placeholder="Who did the check" className="h-11 w-full rounded-md border bg-background px-3 text-base" value={vf.provider} onChange={e => setVf({ ...vf, provider: e.target.value })} />
            <label className="block text-sm">Date of check<input aria-label="Date of check" type="date" className="mt-1 h-11 w-full rounded-md border bg-background px-3 text-base" value={vf.checkedOn} onChange={e => setVf({ ...vf, checkedOn: e.target.value })} /></label>
            <input aria-label="Reference" placeholder="Reference number (optional)" className="h-11 w-full rounded-md border bg-background px-3 text-base" value={vf.reference} onChange={e => setVf({ ...vf, reference: e.target.value })} />
            <Textarea aria-label="Confirmation note" placeholder="Confirm identity and screening passed" value={vf.note} onChange={e => setVf({ ...vf, note: e.target.value })} />
            <div className="flex flex-wrap gap-2"><ApprovalButton title="Mark identity and screening approved?" description={`${row.fileName}. This records that ${vf.provider || 'the outside provider'} verified this investor and marks KYC and AML approved.`} disabled={busy || !vf.provider.trim() || !vf.checkedOn || !vf.note.trim()} onApprove={() => { void saveVerify(row.id); }}>Save and approve</ApprovalButton><Button className="min-h-11 text-base" variant="ghost" disabled={busy} onClick={() => setVerifying(null)}>Go back</Button></div>
          </div>}
          {reviewing === row.id && <div className="space-y-3 border-t pt-3">
            {row.kind === 'tax_form' && <p className="text-sm text-muted-foreground">Approve this signed copy only. The investor’s certification and required tax checks remain separate.</p>}
            <Textarea aria-label="Review note" placeholder="Review note" value={note} onChange={e => setNote(e.target.value)} />
            <div className="flex flex-wrap gap-2"><ApprovalButton title="Approve this document copy?" description={`${row.fileName}. This approves the uploaded copy only, not the investor’s identity, accreditation, tax certification or funding.`} disabled={busy} onApprove={() => { void decide(row.id, 'accepted'); }}>Approve copy</ApprovalButton><Button className="min-h-11 text-base" variant="outline" disabled={busy || !note.trim()} onClick={() => decide(row.id, 'needs_followup')}>Request more</Button><Button className="min-h-11 text-base" variant="ghost" disabled={busy} onClick={() => setReviewing(null)}>Go back</Button></div>
          </div>}
        </li>)}</ul>
      </CardContent></Card>
  );
}
