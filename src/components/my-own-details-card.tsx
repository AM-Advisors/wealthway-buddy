import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveMyOwnPartyDetailsFn } from "@/lib/investor-record.functions";

const FIELDS = [
  ["phone", "Phone", "tel", "tel"], ["dateOfBirth", "Date of birth", "date", "bday"], ["ssn", "SSN (9 digits)", "text", "off"],
  ["citizenship", "Citizenship", "text", "country-name"], ["addressLine1", "Street address", "text", "address-line1"],
  ["city", "City", "text", "address-level2"], ["region", "State", "text", "address-level1"],
  ["postalCode", "ZIP code", "text", "postal-code"], ["country", "Country", "text", "country-name"],
] as const;

/** Each trustee/owner adds their own blank details from their own login. Saved values can't be changed here. */
export function MyOwnDetailsCard({ onboardingId }: { onboardingId: string }) {
  const save = useServerFn(saveMyOwnPartyDetailsFn);
  const qc = useQueryClient();
  const [v, setV] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const filled = Object.values(v).some((x) => x.trim());
  return (
    <Card>
      <CardHeader><CardTitle className="text-lg">Add your own details</CardTitle>
        <p className="text-sm text-muted-foreground">If you're listed on this trust or company, fill in anything of yours that's still missing. Only blank items are saved; ask Harmonious to change something already on file.</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          {FIELDS.map(([k, label, type, ac]) => (
            <div key={k} className="space-y-1">
              <Label htmlFor={`mine-${k}`}>{label}</Label>
              <Input id={`mine-${k}`} type={type} autoComplete={ac} value={v[k] ?? ""} onChange={(e) => setV({ ...v, [k]: e.target.value })} {...(k === "ssn" ? { inputMode: "numeric" as const, "data-private": true } : {})} />
            </div>
          ))}
        </div>
        <Button disabled={!filled || busy} onClick={async () => {
          setBusy(true);
          try {
            const data: Record<string, string> = { onboardingId };
            for (const [k, x] of Object.entries(v)) if (x.trim()) data[k] = x.trim();
            const r = await save({ data: data as any });
            toast.success(r.saved ? "Your details are saved" : "Nothing new to save. Those items are already on file.");
            setV({});
            void qc.invalidateQueries({ queryKey: ["onboarding", onboardingId] });
            void qc.invalidateQueries({ queryKey: ["investment-parties", onboardingId] });
          } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't save your details"); }
          finally { setBusy(false); }
        }}>Save my details</Button>
      </CardContent>
    </Card>
  );
}
