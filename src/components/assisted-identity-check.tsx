import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { fileToBase64 } from "@/components/fund-tabs/shared";
import { assistedIdentityStatusFn, runAssistedIdentityCheckFn } from "@/lib/assisted-identity.functions";

const DOCS = [["drivers_license", "Driver's license"], ["state_id", "State ID card"], ["passport", "Passport"]] as const;
type Doc = (typeof DOCS)[number][0];

/** A helper runs the investor's identity check with a photo of their ID. No selfie or face scan. */
export function AssistedIdentityCheck({ onboardingId, preparerId, onDone }: { onboardingId: string; preparerId?: string; onDone?: () => void }) {
  const qc = useQueryClient();
  const statusFn = useServerFn(assistedIdentityStatusFn);
  const runFn = useServerFn(runAssistedIdentityCheckFn);
  const key = ["assisted-identity", onboardingId, preparerId ?? null];
  const q = useQuery({ queryKey: key, queryFn: () => statusFn({ data: { onboardingId, ...(preparerId ? { preparerId } : {}) } }), retry: false });
  const [doc, setDoc] = useState<Doc>("drivers_license");
  const [front, setFront] = useState<File | null>(null);
  const [back, setBack] = useState<File | null>(null);
  const [permission, setPermission] = useState(false);
  const [result, setResult] = useState<{ cleared: boolean; reasons: string[] } | null>(null);
  const run = useMutation({
    mutationFn: async () => {
      const f = async (x: File) => ({ base64: await fileToBase64(x), contentType: x.type || "image/jpeg", fileName: x.name });
      return runFn({ data: { onboardingId, ...(preparerId ? { preparerId } : {}), documentType: doc, front: await f(front!), ...(back ? { back: await f(back) } : {}), permission } });
    },
    onSuccess: (r) => {
      setResult(r);
      if (r.cleared) toast.success("Identity check cleared.");
      else toast.warning("The identity check didn't clear yet. See what to fix below.");
      setFront(null); setBack(null); setPermission(false);
      qc.invalidateQueries({ queryKey: key }); onDone?.();
    },
    onError: (e) => toast.error((e as Error).message.replace(/^Forbidden: /, "")),
  });
  const s = q.data;
  if (q.isLoading) return null;
  if (q.isError) return null;
  if (!s) return null;
  const verified = s.kyc === "approved";

  return (
    <section className="space-y-3 rounded-lg border p-4">
      <div>
        <h4 className="text-lg font-medium">Run identity check for the investor</h4>
        <p className="text-sm text-muted-foreground">
          Use the details already entered and a photo of the investor's government ID. No selfie or face scan is needed. It clears right away when the ID is genuine, current, and matches the name and date of birth on file. The investor still signs everything themselves.
        </p>
      </div>
      {verified ? (
        <p className="text-base font-medium text-primary">Identity verified. Nothing else to do here.</p>
      ) : (
        <>
          {result && (
            result.cleared
              ? <p className="text-base font-medium text-primary">Identity check cleared.</p>
              : <ul className="list-disc space-y-1 rounded-md border border-destructive/40 bg-destructive/5 p-3 pl-6 text-sm">{result.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
          )}
          {s.blocker ? <p className="text-sm text-muted-foreground">{s.blocker}</p> : (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor={`aid-doc-${onboardingId}`} className="text-base">Type of ID</Label>
                <select id={`aid-doc-${onboardingId}`} className="h-11 w-full rounded-md border bg-background px-3 text-base" value={doc} onChange={(e) => setDoc(e.target.value as Doc)}>
                  {DOCS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor={`aid-front-${onboardingId}`} className="text-base">Front of the ID</Label>
                  <input id={`aid-front-${onboardingId}`} type="file" accept="image/*" className="block w-full text-sm" onChange={(e) => setFront(e.target.files?.[0] ?? null)} />
                </div>
                {doc !== "passport" && (
                  <div className="space-y-1">
                    <Label htmlFor={`aid-back-${onboardingId}`} className="text-base">Back of the ID</Label>
                    <input id={`aid-back-${onboardingId}`} type="file" accept="image/*" className="block w-full text-sm" onChange={(e) => setBack(e.target.files?.[0] ?? null)} />
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">Take the photo of the original ID with all four corners showing. The photo goes to our verification service and isn't saved on the platform.</p>
              <label className="flex items-start gap-2 text-sm">
                <Checkbox checked={permission} onCheckedChange={(v) => setPermission(!!v)} className="mt-0.5" />
                <span>I have {s.investorName ?? "the investor"}'s permission to run this check, and this is their own current ID.</span>
              </label>
              <Button size="lg" disabled={run.isPending || !front || !permission} onClick={() => run.mutate()}>
                {run.isPending ? "Checking the ID…" : "Run identity check"}
              </Button>
              <p className="text-xs text-muted-foreground">{s.triesLeft} {s.triesLeft === 1 ? "try" : "tries"} left today.</p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
