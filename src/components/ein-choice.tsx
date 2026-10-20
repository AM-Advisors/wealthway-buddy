import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ThirdPartyBadge, ThirdPartyNote } from "@/components/third-party-badge";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { EinField } from "@/components/fund-workspace";
import { Ss4RequestPanel } from "@/components/ss4-request";
import { generateSs4, getEinChoiceFn, saveFundEinFn, setEinChoiceFn } from "@/lib/fund-entity.functions";

const IRS_URL = "https://www.irs.gov/businesses/small-businesses-self-employed/get-an-employer-identification-number";

/** EIN: the fund gets it from the IRS itself, or Harmonious prepares the SS-4. */
export function EinChoice({ offeringId, onChanged }: { offeringId: string; onChanged?: () => void }) {
  const qc = useQueryClient();
  const load = useServerFn(getEinChoiceFn);
  const setChoice = useServerFn(setEinChoiceFn);
  const saveEin = useServerFn(saveFundEinFn);
  const makeSs4 = useServerFn(generateSs4);
  const key = ["ein-choice", offeringId];
  const q = useQuery({ queryKey: key, queryFn: () => load({ data: { offering_id: offeringId } }) });
  const [ein, setEin] = useState("");

  const choose = useMutation({
    mutationFn: (setup_by: "fund" | "harmonious") => setChoice({ data: { offering_id: offeringId, setup_by } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: key }); onChanged?.(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const save = useMutation({
    mutationFn: () => saveEin({ data: { offering_id: offeringId, ein } }),
    onSuccess: () => { toast.success("EIN saved"); setEin(""); qc.invalidateQueries({ queryKey: ["fund-ein", offeringId] }); onChanged?.(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const ss4 = useMutation({
    mutationFn: () => makeSs4({ data: { offering_id: offeringId } }),
    onSuccess: (r) => { if (r.url) window.open(r.url, "_blank", "noopener"); else toast.success("Form SS-4 created. Harmonious will review it."); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.isPending) return <div className="h-16 animate-pulse rounded-xl bg-muted" />;
  if (q.isError) return <p className="text-sm text-destructive">{(q.error as Error).message}</p>;
  const by = q.data.setupBy;
  const opt = (on: boolean) => `flex-1 rounded-xl border px-4 py-3 text-left text-sm transition ${on ? "border-primary bg-primary/5 font-medium" : "hover:border-primary"}`;

  return (
    <div className="space-y-3">
      <div className="rounded-xl border bg-background px-4 py-3 text-sm"><EinField fundId={offeringId} /></div>
      <p className="flex flex-wrap items-center gap-2 text-sm font-medium">Who is getting the EIN? <ThirdPartyBadge provider="the IRS" /></p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <button type="button" className={opt(by === "fund")} disabled={choose.isPending} onClick={() => choose.mutate("fund")}>
          The fund manager<span className="block text-xs font-normal text-muted-foreground">Apply online with the IRS, then enter the EIN here.</span>
        </button>
        <button type="button" className={opt(by === "harmonious")} disabled={choose.isPending} onClick={() => choose.mutate("harmonious")}>
          Harmonious<span className="block text-xs font-normal text-muted-foreground">We prepare Form SS-4 for signature and file it.</span>
        </button>
      </div>

      {by === "fund" && (
        <div className="space-y-3 rounded-xl border bg-background p-4">
          <a href={IRS_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">Apply for an EIN on the IRS website <ExternalLink className="h-3.5 w-3.5" /></a>
          <p className="text-xs text-muted-foreground">It's free and you usually get the EIN right away. Save the IRS confirmation letter (CP 575) for your records.</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input className="h-10 flex-1 rounded-xl border border-input bg-background px-4 text-sm" placeholder="12-3456789" value={ein} onChange={(e) => setEin(e.target.value)} />
            <Button size="sm" className="h-10" disabled={!ein.trim() || save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Saving…" : "Save EIN"}</Button>
          </div>
        </div>
      )}

      {by === "harmonious" && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-background p-4">
            <p className="text-sm">Download the filled Form SS-4 to sign yourself, or send it to the signatory below.</p>
            <Button size="sm" variant="outline" disabled={ss4.isPending} onClick={() => ss4.mutate()}>{ss4.isPending ? "Preparing…" : "Get Form SS-4"}</Button>
          </div>
          <Ss4RequestPanel fundId={offeringId} />
        </div>
      )}
    </div>
  );
}
