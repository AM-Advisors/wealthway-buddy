import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  BRAND_FONTS,
  WHITELABEL_MONTHLY_FEE,
  WHITELABEL_STATUS_LABEL,
  customAppAddress,
  isWhitelabelActive,
} from "@/lib/client-branding";
import { requestPaidWhitelabel, saveClientBranding } from "@/lib/client-branding.functions";

const DEFAULT = "__default";

/** White-label options and branding editor for one client. */
export function WhitelabelEditor({ clientId, branding, canEdit, queryKey }: { clientId: string; branding: any | null; canEdit: boolean; queryKey: unknown[] }) {
  const qc = useQueryClient();
  const status = branding?.whitelabel_status ?? "off";
  const active = isWhitelabelActive(status);
  const request = useServerFn(requestPaidWhitelabel);
  const save = useServerFn(saveClientBranding);

  const [logo, setLogo] = useState<string | null | undefined>(undefined);
  const [displayName, setDisplayName] = useState("");
  const [headingFont, setHeadingFont] = useState<string | null>(null);
  const [bodyFont, setBodyFont] = useState<string | null>(null);
  const [primary, setPrimary] = useState<string>("");
  const [accent, setAccent] = useState<string>("");
  const [sub, setSub] = useState("");

  useEffect(() => {
    setLogo(undefined);
    setDisplayName(branding?.display_name ?? "");
    setHeadingFont(branding?.heading_font ?? null);
    setBodyFont(branding?.body_font ?? null);
    setPrimary(branding?.primary_color ?? "");
    setAccent(branding?.accent_color ?? "");
    setSub(branding?.subdomain ?? "");
  }, [branding]);

  const refresh = () => qc.invalidateQueries({ queryKey });
  const req = useMutation({
    mutationFn: () => request({ data: { clientId } }),
    onSuccess: () => { toast.success("White-label requested. Harmonious will set up the monthly card billing."); refresh(); },
    onError: (e) => toast.error((e as Error).message),
  });
  const sv = useMutation({
    mutationFn: () =>
      save({ data: {
        clientId,
        displayName: displayName.trim() || null,
        logoDataUrl: logo,
        headingFont, bodyFont,
        primaryColor: primary || null,
        accentColor: accent || null,
        subdomain: sub.trim() || null,
      } }),
    onSuccess: () => { toast.success("Branding saved."); refresh(); qc.invalidateQueries({ queryKey: ["my-client-branding"] }); },
    onError: (e) => toast.error((e as Error).message),
  });

  const onFile = (f: File | undefined) => {
    if (!f) return;
    if (f.size > 250_000) { toast.error("Please use a logo under 250 KB."); return; }
    const r = new FileReader();
    r.onload = () => setLogo(String(r.result));
    r.readAsDataURL(f);
  };

  const preview = logo === undefined ? branding?.logo_path : logo;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">White-label</span>
        <Badge variant={active ? "default" : "secondary"}>{WHITELABEL_STATUS_LABEL[status]}</Badge>
      </div>
      {status === "off" && (
        <div className="rounded-md border p-3 text-sm">
          <p>Use your own logo, fonts, colors and web address for ${WHITELABEL_MONTHLY_FEE}/month, billed to a card each month.</p>
          {canEdit && (
            <Button className="mt-2" size="sm" disabled={req.isPending} onClick={() => req.mutate()}>
              Request white-label (${WHITELABEL_MONTHLY_FEE}/month)
            </Button>
          )}
        </div>
      )}
      {status === "payment_pending" && (
        <p className="text-sm text-muted-foreground">Harmonious is setting up the monthly card billing. Branding unlocks once it's active.</p>
      )}
      {active && (
        <fieldset disabled={!canEdit} className="space-y-4">
          <div className="space-y-1">
            <Label>Logo</Label>
            <div className="flex items-center gap-3">
              {preview ? <img src={preview} alt="Logo preview" className="h-10 max-w-[160px] rounded border bg-muted object-contain p-1" /> : <span className="text-xs text-muted-foreground">Harmonious logo shown</span>}
              <Input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="max-w-xs" onChange={(e) => onFile(e.target.files?.[0])} />
              {preview && <Button type="button" variant="ghost" size="sm" onClick={() => setLogo(null)}>Remove</Button>}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {([["Heading font", headingFont, setHeadingFont], ["Body font", bodyFont, setBodyFont]] as const).map(([label, val, set]) => (
              <div key={label} className="space-y-1">
                <Label>{label}</Label>
                <Select value={val ?? DEFAULT} onValueChange={(v) => set(v === DEFAULT ? null : v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={DEFAULT}>Harmonious default</SelectItem>
                    {BRAND_FONTS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ))}
            {([["Main color", primary, setPrimary], ["Accent color", accent, setAccent]] as const).map(([label, val, set]) => (
              <div key={label} className="space-y-1">
                <Label>{label}</Label>
                <div className="flex gap-2">
                  <input type="color" aria-label={label} value={val || "#142647"} onChange={(e) => set(e.target.value)} className="h-9 w-12 rounded border" />
                  <Input value={val} placeholder="Harmonious default" onChange={(e) => set(e.target.value)} />
                </div>
              </div>
            ))}
          </div>
          <div className="space-y-1">
            <Label>Web address</Label>
            <div className="flex items-center gap-1 text-sm">
              <span>app.</span>
              <Input className="max-w-[200px]" value={sub} placeholder="yourname" onChange={(e) => setSub(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} />
              <span>.harmonious.co</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {customAppAddress(sub) ? `Saved as ${customAppAddress(sub)}. Harmonious connects the address separately; until then your branding shows on the usual address.` : "Choose the name for your own address."}
            </p>
          </div>
          {canEdit && <Button disabled={sv.isPending} onClick={() => sv.mutate()}>{sv.isPending ? "Saving..." : "Save branding"}</Button>}
        </fieldset>
      )}
    </div>
  );
}
