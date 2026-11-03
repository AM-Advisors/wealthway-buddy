import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { teamPrepareContextFn, teamSaveInvestorAnswersFn } from "@/lib/investor-onboarding.functions";
import { createPersonalInvestmentLink, getPersonalInvestmentLink, sendPersonalInvestmentLink } from "@/lib/personal-investment-link.functions";
import { questionVisible } from "@/lib/investor-onboarding-model";

/**
 * Manager, fund team or Harmonious fills in the investor's details, then sends
 * them to sign. The investor reviews and confirms every answer before signing.
 */
export function FillForInvestorButton({ onboardingId, name }: { onboardingId: string; name: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="outline" className="shrink-0" onClick={() => setOpen(true)} aria-label={`Fill in details for ${name}`}>
        <PenLine className="mr-1 h-4 w-4" />Fill in for investor
      </Button>
      {open ? <FillDialog onboardingId={onboardingId} name={name} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function FillDialog({ onboardingId, name, onClose }: { onboardingId: string; name: string; onClose: () => void }) {
  const load = useServerFn(teamPrepareContextFn);
  const save = useServerFn(teamSaveInvestorAnswersFn);
  const getLink = useServerFn(getPersonalInvestmentLink), createLink = useServerFn(createPersonalInvestmentLink), sendLink = useServerFn(sendPersonalInvestmentLink);
  const qc = useQueryClient();
  const ctx = useQuery({ queryKey: ["team-prepare", onboardingId], queryFn: () => load({ data: { onboardingId } }), retry: false });
  const [answers, setAnswers] = useState<Record<string, string> | null>(null);
  const [busy, setBusy] = useState(false);
  const base = Object.fromEntries(Object.entries((ctx.data?.answers ?? {}) as Record<string, unknown>).map(([k, v]) => [k, v == null ? "" : String(v)]));
  const current = answers ?? base;
  const set = (k: string, v: string) => setAnswers({ ...current, [k]: v });
  const questions = ((ctx.data?.questions ?? []) as any[]).filter((q) => questionVisible(q, current));
  const locked = (ctx.data?.locked ?? {}) as Record<string, string | null>;
  const blank = questions.filter((q) => q.required && !q.locked && !q.satisfiedBy && !String(current[q.key] ?? "").trim()).length;

  const submit = async (send: boolean) => {
    setBusy(true);
    try {
      const editable = Object.fromEntries(questions.filter((q) => !q.locked).map((q) => [q.key, String(current[q.key] ?? "")]));
      await save({ data: { onboardingId, answers: editable } });
      if (send) {
        const cur = await getLink({ data: { onboardingId } });
        if (cur.link?.state === "claimed") {
          toast.success(`Saved. ${name} will see the answers ready to check and sign next time they sign in.`);
        } else {
          if (!cur.link) await createLink({ data: { onboardingId } });
          await sendLink({ data: { onboardingId } });
          toast.success(`Saved and sent to ${name} to check and sign.`);
        }
      } else toast.success("Saved. Nothing was sent yet.");
      qc.invalidateQueries();
      onClose();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Fill in for {name}</DialogTitle>
          <DialogDescription>Enter what you know, then send it to {name} to sign. They check every answer and confirm it is true before signing. Their accreditation choice, uploads, tax ID and bank details stay with them.</DialogDescription>
        </DialogHeader>
        {ctx.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : ctx.error ? (
          <p className="text-sm text-destructive">{(ctx.error as Error).message}</p>
        ) : ctx.data?.confirmedByInvestor ? (
          <p className="text-sm">{name} already confirmed their answers. Only they can change them now.</p>
        ) : (
          <div className="space-y-4">
            {questions.map((q) => (
              <div key={q.key} className="space-y-1.5">
                <Label htmlFor={`fill-${q.key}`} className="leading-snug">{q.label}{q.required && !q.satisfiedBy ? " *" : ""}</Label>
                {q.locked ? (
                  <div className="rounded-md border bg-muted px-3 py-2 text-sm">{locked[q.key] || current[q.key] || <span className="text-muted-foreground">Fills in from their verification</span>}</div>
                ) : q.type === "yes_no" ? (
                  <div className="flex gap-2">{["Yes", "No"].map((o) => <Button key={o} type="button" size="sm" variant={current[q.key] === o ? "default" : "outline"} onClick={() => set(q.key, o)}>{o}</Button>)}</div>
                ) : q.type === "select" ? (
                  <Select value={current[q.key] ?? ""} onValueChange={(v) => set(q.key, v)}>
                    <SelectTrigger id={`fill-${q.key}`}><SelectValue placeholder="Choose one" /></SelectTrigger>
                    <SelectContent>{(q.options ?? []).map((o: string) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                  </Select>
                ) : (
                  <Input id={`fill-${q.key}`} type={q.type === "date" ? "date" : "text"} value={current[q.key] ?? ""} onChange={(e) => set(q.key, e.target.value)} />
                )}
              </div>
            ))}
            <p className="text-xs text-muted-foreground">{blank ? `${blank} required answer${blank === 1 ? "" : "s"} still blank. ${name} can fill ${blank === 1 ? "it" : "them"} in.` : "Everything required is filled in."}</p>
            <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t bg-background pt-3">
              <Button variant="outline" disabled={busy} onClick={() => submit(false)}>Save only</Button>
              <Button size="lg" disabled={busy} onClick={() => submit(true)}>Save and send to sign</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
