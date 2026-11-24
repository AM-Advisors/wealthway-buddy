import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Eye } from "lucide-react";
import { investorPerspectiveFn } from "@/lib/investor-perspective.functions";
import { PERSPECTIVE_STEPS, perspectiveStepFor, type InvestorPerspectiveData, type PerspectiveStep } from "@/lib/investor-perspective";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LoadError } from "@/components/load-error";

export function InvestorPerspectiveButton({ onboardingId, participantId, label = "View client perspective" }: { onboardingId: string; participantId?: string; label?: string }) {
  const [open, setOpen] = useState(false);
  return <><Button variant="outline" size="sm" onClick={() => setOpen(true)}><Eye className="mr-1 h-4 w-4" />{label}</Button>{open && <InvestorPerspectiveDialog onboardingId={onboardingId} participantId={participantId ?? null} onClose={() => setOpen(false)} />}</>;
}

function InvestorPerspectiveDialog({ onboardingId, participantId, onClose }: { onboardingId: string; participantId: string | null; onClose: () => void }) {
  const load = useServerFn(investorPerspectiveFn);
  const [person, setPerson] = useState(participantId);
  const q = useQuery({ queryKey: ["investor-perspective", onboardingId, person], queryFn: () => load({ data: { onboardingId, participantId: person } }), retry: false });
  return <Dialog open onOpenChange={o => !o && onClose()}><DialogContent className="max-h-[90dvh] max-w-4xl overflow-y-auto">
    <DialogHeader><DialogTitle>{q.data?.selectedParticipant ? `${q.data.selectedParticipant.name}: ${q.data.selectedParticipant.role} view` : "Investor perspective"}</DialogTitle><DialogDescription>{q.data ? `${q.data.fundName} · ${q.data.investorName}` : "Loading investment"} · Read-only</DialogDescription></DialogHeader>
    {q.isPending ? <p>Loading…</p> : q.isError || !q.data ? <LoadError what="Investor perspective" error={q.error} onRetry={() => void q.refetch()} /> : <InvestorPerspectiveContent data={q.data} onParticipant={setPerson} />}
  </DialogContent></Dialog>;
}

const LABELS: Record<PerspectiveStep, string> = { about: "About you", verify: "Verification", sign: "Sign", fund: "Fund" };
const status = (s: string) => s === "not_started" ? "Not started" : s.replace(/_/g, " ");

export function InvestorPerspectiveContent({ data, onParticipant }: { data: InvestorPerspectiveData; onParticipant: (id: string | null) => void }) {
  const [step, setStep] = useState<PerspectiveStep>("about");
  const [item, setItem] = useState<string | null>(null);
  const items = data.items.filter(i => perspectiveStepFor(i.key) === step);
  const selected = items.find(i => i.key === item);
  const history = data.history.filter(h => h.step === step);
  return <div className="space-y-6">
    <nav aria-label="Investor steps" className="grid grid-cols-2 gap-2 sm:grid-cols-4">{PERSPECTIVE_STEPS.map(key => <Button key={key} variant={step === key ? "default" : "outline"} className="h-auto min-h-16 flex-col items-start whitespace-normal text-left" onClick={() => { setStep(key); setItem(null); }}><span>{LABELS[key]}</span><span className="text-xs font-normal">{data.steps.find(s => s.key === key)?.message ?? "View requirements"}</span></Button>)}</nav>
    <section className="space-y-3" aria-label={LABELS[step]}><h2 className="text-xl font-semibold">{LABELS[step]}</h2>
      <ul className="divide-y border-y">{items.map(i => <li key={i.key}><Button variant="ghost" className="h-auto w-full justify-between gap-3 whitespace-normal py-3 text-left" onClick={() => setItem(item === i.key ? null : i.key)} aria-expanded={item === i.key}><span>{i.label}</span><Badge variant="outline" className="shrink-0 capitalize">{status(i.status)}</Badge></Button></li>)}</ul>
      {selected && <div className="space-y-2 border-l-2 border-accent pl-4" role="region" aria-label={`${selected.label} details`}><h3 className="font-medium">{selected.label}</h3><p className="text-sm capitalize">{status(selected.status)}</p><p className="text-sm text-muted-foreground">{selected.status === "complete" ? "Completed in the recorded investment." : selected.owner === "investor" ? "The investor completes this requirement." : selected.owner === "fund_manager" ? "The fund manager completes this requirement." : "See the recorded progress below."}</p></div>}
      {step === "about" && <dl className="grid gap-4 sm:grid-cols-2">{data.person.map(p => <div key={p.label}><dt className="text-sm text-muted-foreground">{p.label}</dt><dd className="break-words">{p.value}</dd></div>)}<div><dt className="text-sm text-muted-foreground">Commitment</dt><dd>{data.amountCents == null ? "Not provided" : (data.amountCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })}</dd></div></dl>}
      {step === "sign" && <><section aria-label="Investor questionnaire" className="space-y-3"><h3 className="text-lg font-medium">Investor questionnaire</h3>{data.canReadDetails ? <dl className="space-y-4">{data.questions.map(q => <div key={q.key} className="border-b pb-3"><dt className="break-words text-sm text-muted-foreground">{q.label}</dt><dd className="mt-1 whitespace-pre-line break-words">{q.answer ?? "Not answered yet"}</dd></div>)}</dl> : <p className="text-sm text-muted-foreground">Your access shows progress only. Private answers are not included.</p>}</section><section className="space-y-2" aria-label="Fund documents"><h3 className="text-lg font-medium">Fund documents</h3>{data.documents.map(d => <details key={d.id} className="border-b py-2"><summary className="cursor-pointer break-words">{d.title}</summary><p className="py-2 text-sm">{d.status}</p></details>)}</section></>}
    </section>
    <section className="space-y-3 border-t pt-4" aria-label="Completed by"><h3 className="text-lg font-medium">Completed by</h3><div className="flex flex-wrap gap-2"><Button size="sm" variant={!data.selectedParticipant ? "default" : "outline"} onClick={() => onParticipant(null)}>Investor view</Button>{data.participants.map(p => <Button key={p.id} size="sm" variant={data.selectedParticipant?.id === p.id ? "default" : "outline"} className="h-auto whitespace-normal text-left" onClick={() => onParticipant(p.id)}>{p.name} · {p.role}</Button>)}</div>
      {history.length ? <ul className="divide-y">{history.map(h => <li key={h.id} className="flex flex-wrap justify-between gap-2 py-3 text-sm"><span>{h.label}<span className="block font-medium">By {h.actor}</span></span><time className="text-muted-foreground" dateTime={h.at}>{new Date(h.at).toLocaleString()}</time></li>)}</ul> : <p className="text-sm text-muted-foreground">No completion activity recorded for this step. The person who completed it is not recorded.</p>}
    </section>
    <div className="flex justify-between border-t pt-3"><Button variant="outline" disabled={step === "about"} onClick={() => { setStep(PERSPECTIVE_STEPS[Math.max(0, PERSPECTIVE_STEPS.indexOf(step) - 1)] ?? "about"); setItem(null); }}>Back</Button><Button variant="outline" disabled={step === "fund"} onClick={() => { setStep(PERSPECTIVE_STEPS[Math.min(3, PERSPECTIVE_STEPS.indexOf(step) + 1)] ?? "fund"); setItem(null); }}>Next</Button></div>
  </div>;
}