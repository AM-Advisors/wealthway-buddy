import { useState, type ReactNode } from "react";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getOwnProfileGap, saveOwnProfile } from "@/lib/investor-start.functions";
import { PROFILE_LABELS, type ProfileField } from "@/lib/investor-start-model";

/**
 * "Your profile" step for the person behind the login (name, phone, address).
 * Shows only what's still missing; skipped when the fund team already filled it in.
 * Investment details stay on the investment profile.
 */
export function ProfileStep({ children }: { children: ReactNode }) {
  const load = useServerFn(getOwnProfileGap);
  const save = useServerFn(saveOwnProfile);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["own-profile-gap"], queryFn: () => load(), staleTime: 5 * 60_000, retry: 1 });
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Never block the portal on this step's own load failure.
  if (q.isPending || q.isError || !q.data?.missing.length) return <>{children}</>;
  const missing = q.data.missing as ProfileField[];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await save({ data: values });
      await qc.invalidateQueries({ queryKey: ["own-profile-gap"] });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4 py-10">
      <form onSubmit={submit} className="w-full max-w-md space-y-4">
        <Logo variant="navy" className="h-7 w-auto" />
        <div>
          <h1 className="text-2xl">Complete your profile</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            These are your own contact details. You'll add the details of who is investing (you, a trust or a business) in your investment steps.
          </p>
        </div>
        {missing.map((f) => (
          <div key={f} className="space-y-1.5">
            <Label htmlFor={`pf-${f}`}>{PROFILE_LABELS[f]}</Label>
            <Input id={`pf-${f}`} required value={values[f] ?? ""} autoComplete={f === "phone" ? "tel" : f === "country" ? "country-name" : undefined}
              onChange={(e) => setValues((v) => ({ ...v, [f]: e.target.value }))} />
          </div>
        ))}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit" className="w-full" disabled={busy}>{busy ? "Saving…" : "Save and continue"}</Button>
      </form>
    </div>
  );
}
