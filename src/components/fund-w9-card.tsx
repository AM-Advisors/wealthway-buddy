import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileText, PenLine } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { SignatureAdoptDialog } from "@/components/signature-adopt-dialog";
import { fundW9StateFn, prepareFundW9Fn, signFundW9Fn } from "@/lib/fund-w9.functions";
import { invalidateFund } from "@/lib/fund-query-keys";

export function FundW9Card({ offeringId }: { offeringId: string }) {
  const qc = useQueryClient();
  const load = useServerFn(fundW9StateFn), prepare = useServerFn(prepareFundW9Fn), sign = useServerFn(signFundW9Fn);
  const q = useQuery({ queryKey: ["fund-w9", offeringId], queryFn: () => load({ data: { offeringId } }) });
  const [signer, setSigner] = useState("");
  const [classification, setClassification] = useState("");
  const [llc, setLlc] = useState<"" | "C" | "S" | "P">("");
  const [reviewed, setReviewed] = useState(false), [consent, setConsent] = useState(false), [adopt, setAdopt] = useState(false), [busy, setBusy] = useState(false);
  const d = q.data;
  if (q.isPending) return <p className="text-sm text-muted-foreground">Loading W-9…</p>;
  if (q.isError) return <p role="alert" className="text-sm text-destructive">{(q.error as Error).message}</p>;
  if (!d?.needed) return null;
  const r = d.request;
  const signed = r?.status === "signed" && !d.newerSource;
  const signerId = d.staff ? signer || d.managers[0]?.id || "" : d.me;
  const currentClass = classification || d.details.classification.split(" ")[0] || "";
  const myTurn = r?.status === "pending" && r.signerId === d.me && d.assigned;
  return <section id="fund-w9" className="space-y-3 rounded-lg border bg-card p-5">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="flex items-center gap-2 font-heading font-semibold text-primary"><FileText className="h-4 w-4" />Fund Form W-9</h3><span className="text-xs text-muted-foreground">{signed ? `Signed by ${r?.signedName}` : r?.status === "pending" ? "Waiting on fund manager signature" : "Fund manager signature needed"}</span></div>
    <dl className="grid gap-2 text-sm sm:grid-cols-2"><div><dt className="text-xs text-muted-foreground">Fund legal name</dt><dd>{d.details.legalName || "Not recorded"}</dd></div><div><dt className="text-xs text-muted-foreground">EIN</dt><dd>{d.details.ein}</dd></div><div className="sm:col-span-2"><dt className="text-xs text-muted-foreground">Address</dt><dd>{d.details.address || "Not recorded"}</dd></div></dl>
    {r && <Button size="sm" variant="outline" asChild><a href={r.url} target="_blank" rel="noreferrer" onClick={() => setReviewed(true)}>{signed ? "Open signed W-9" : "Review populated W-9"}</a></Button>}
    {!signed && r?.status !== "pending" && <>
      {d.staff && <label className="block space-y-1 text-sm">Fund manager<select aria-label="W-9 fund manager" className="h-10 w-full rounded-md border bg-background px-3" value={signerId} onChange={(e) => setSigner(e.target.value)}>{d.managers.map((m: { id: string; name: string }) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>}
      <label className="block space-y-1 text-sm">Federal tax classification<select aria-label="W-9 federal tax classification" className="h-10 w-full rounded-md border bg-background px-3" value={currentClass} onChange={(e) => setClassification(e.target.value)}><option value="">Select…</option><option value="partnership">Partnership</option><option value="llc">LLC</option><option value="c_corp">C corporation</option><option value="s_corp">S corporation</option><option value="trust">Trust / estate</option></select></label>
      {currentClass === "llc" && <label className="block space-y-1 text-sm">LLC tax classification<select aria-label="LLC tax classification" className="h-10 w-full rounded-md border bg-background px-3" value={llc || d.details.classification.split(" ")[1] || ""} onChange={(e) => setLlc(e.target.value as "" | "C" | "S" | "P")}><option value="">Select…</option><option value="P">Partnership (P)</option><option value="C">C corporation (C)</option><option value="S">S corporation (S)</option></select></label>}
      {!!d.missing.filter((x) => x !== "Federal tax classification").length && <p className="text-sm text-destructive">Missing: {d.missing.filter((x) => x !== "Federal tax classification").join(", ")}</p>}
      <Button size="sm" disabled={busy || !signerId || !currentClass} onClick={async () => { setBusy(true); try { await prepare({ data: { offeringId, signerId, classification: currentClass as any, llcClass: currentClass === "llc" ? (llc || d.details.classification.split(" ")[1] || undefined) as "C" | "S" | "P" | undefined : undefined } }); setReviewed(false); setConsent(false); await invalidateFund(qc, offeringId); toast.success(d.staff ? "W-9 ready for fund manager signature" : "W-9 ready to review"); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); } }}>{d.staff ? "Prepare W-9 for manager signature" : "Prepare W-9 to review and sign"}</Button>
    </>}
    {myTurn && <><label className="flex items-start gap-2 text-sm"><Checkbox checked={consent} onCheckedChange={(v) => setConsent(v === true)} /><span>I reviewed the populated W-9, am authorized to sign for this fund, and adopt the certification printed on the form.</span></label><Button size="sm" disabled={!reviewed || !consent || busy} onClick={() => setAdopt(true)}><PenLine className="mr-2 h-4 w-4" />Sign W-9</Button></>}
    <SignatureAdoptDialog open={adopt} onOpenChange={setAdopt} defaultName={d.managers.find((m: { id: string; name: string }) => m.id === d.me)?.name} onAdopt={async (signature) => { if (!r) return; setBusy(true); try { await sign({ data: { offeringId, requestId: r.id, signedName: signature.name, signature: { method: signature.method, image: signature.image }, consent: true } }); await invalidateFund(qc, offeringId); toast.success("Signed W-9 saved to the fund"); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); } }} />
  </section>;
}