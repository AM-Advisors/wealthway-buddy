import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getMercuryReadiness, startMercuryApplication } from "@/lib/fund-entity.functions";
import { fileToBase64 } from "@/components/fund-tabs/shared";

const STATUS: Record<string, string> = {
  application_started: "Application started",
  submitted: "Submitted to Mercury",
  approved: "Approved by Mercury",
  needs_info: "Mercury needs more info",
  declined: "Declined by Mercury",
};

/** Mercury: Harmonious pre-fills the application; the manager reviews and submits it on Mercury. */
export function MercuryApplicationCard({ fundId }: { fundId: string }) {
  const qc = useQueryClient();
  const load = useServerFn(getMercuryReadiness);
  const start = useServerFn(startMercuryApplication);
  const q = useQuery({ queryKey: ["mercury-readiness", fundId], queryFn: () => load({ data: { offering_id: fundId } }), retry: false });
  const [a, setA] = useState({ address1: "", address2: "", city: "", region: "", postalCode: "", phone: "", website: "" });
  const [file, setFile] = useState<File | null>(null);
  const [docType, setDocType] = useState("CertificateOfFormation");
  const [confirmed, setConfirmed] = useState(false);

  const m = useMutation({
    mutationFn: async () => {
      const formationDoc = file
        ? { fileName: file.name, base64: await fileToBase64(file), type: docType as any }
        : undefined;
      return start({ data: { offering_id: fundId, address: { address1: a.address1, address2: a.address2 || undefined, city: a.city, region: a.region, postalCode: a.postalCode }, phone: a.phone || undefined, website: a.website || undefined, formationDoc, confirmed: true } as any });
    },
    onSuccess: (r) => {
      toast.success("Your Mercury application is ready. Finish it on Mercury.");
      window.open(r.signupLink, "_blank", "noopener,noreferrer");
      void qc.invalidateQueries({ queryKey: ["mercury-readiness", fundId] });
      void qc.invalidateQueries({ queryKey: ["fund-entity", fundId] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not send to Mercury."),
  });

  if (q.isLoading) return <p className="text-sm text-muted-foreground">Checking your fund's details…</p>;
  if (q.error || !q.data) return <p className="text-sm text-destructive">Couldn't load the Mercury application.</p>;
  const r = q.data;
  if (!r.configured) return null;

  if (r.existing) {
    return (
      <div className="space-y-2 rounded-md border p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">Mercury application</p>
          <Badge variant="secondary">{STATUS[r.existing.status] ?? r.existing.status}</Badge>
        </div>
        <p className="text-xs text-muted-foreground">Mercury reviews and decides. Harmonious never submits the application or moves money.</p>
        <Button asChild size="sm"><a href={r.existing.signupLink} target="_blank" rel="noopener noreferrer">Continue your Mercury application</a></Button>
      </div>
    );
  }

  const set = (k: keyof typeof a) => (e: React.ChangeEvent<HTMLInputElement>) => setA({ ...a, [k]: e.target.value });
  const ok = a.address1 && a.city && a.region.length === 2 && /^\d{5}/.test(a.postalCode) && confirmed && r.missing.length === 0;

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div>
        <p className="text-sm font-medium">Open with Mercury</p>
        <p className="text-xs text-muted-foreground">
          We'll pre-fill Mercury's application for {r.legalName || "your fund"}. You review it and submit it on Mercury. ID photos and Social Security numbers are entered directly with Mercury, never sent by Harmonious.
        </p>
      </div>
      {r.missing.length > 0 && (
        <ul className="list-disc pl-5 text-xs text-destructive">{r.missing.map((x) => <li key={x}>{x}</li>)}</ul>
      )}
      <p className="text-xs">Owners sent: {r.owners.map((o) => o.name).join(", ") || "none yet"}{r.hasEin ? " · EIN on file" : " · EIN pending"}</p>
      {r.addressOnFile && <p className="text-xs text-muted-foreground">Address on file: {r.addressOnFile}</p>}
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="grid gap-1 sm:col-span-2"><Label>Street address</Label><Input value={a.address1} onChange={set("address1")} /></div>
        <div className="grid gap-1 sm:col-span-2"><Label>Suite (optional)</Label><Input value={a.address2} onChange={set("address2")} /></div>
        <div className="grid gap-1"><Label>City</Label><Input value={a.city} onChange={set("city")} /></div>
        <div className="grid grid-cols-2 gap-2">
          <div className="grid gap-1"><Label>State</Label><Input maxLength={2} placeholder="TX" value={a.region} onChange={set("region")} /></div>
          <div className="grid gap-1"><Label>ZIP</Label><Input value={a.postalCode} onChange={set("postalCode")} /></div>
        </div>
        <div className="grid gap-1"><Label>Business phone (optional)</Label><Input value={a.phone} onChange={set("phone")} /></div>
        <div className="grid gap-1"><Label>Website (optional)</Label><Input value={a.website} onChange={set("website")} /></div>
      </div>
      {r.hasEin && (
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="grid gap-1">
            <Label>Formation document (optional)</Label>
            <Input type="file" accept="application/pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
          <div className="grid gap-1">
            <Label>Document type</Label>
            <select className="h-9 rounded-md border bg-background px-2 text-sm" value={docType} onChange={(e) => setDocType(e.target.value)}>
              <option value="CertificateOfFormation">Certificate of Formation</option>
              <option value="ArticlesOfOrganization">Articles of Organization</option>
              <option value="PartnershipAgreement">Partnership Agreement</option>
              <option value="ArticlesOfIncorporation">Articles of Incorporation</option>
            </select>
          </div>
        </div>
      )}
      <label className="flex items-start gap-2 text-xs">
        <Checkbox checked={confirmed} onCheckedChange={(v) => setConfirmed(v === true)} />
        Send my fund's details to Mercury so they can pre-fill the application.
      </label>
      <Button size="sm" disabled={!ok || m.isPending} onClick={() => m.mutate()}>
        {m.isPending ? "Sending…" : "Start Mercury application"}
      </Button>
    </div>
  );
}
