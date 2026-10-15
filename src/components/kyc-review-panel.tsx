import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Clock, MinusCircle, Image as ImageIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { verificationImagesFn } from "@/lib/account-kyc.functions";
import type { ReviewDetails, ReviewStatus } from "@/lib/kyc-review-model";

const ICON = { pass: CheckCircle2, fail: XCircle, review: Clock, none: MinusCircle };
const COLOR = { pass: "text-primary", fail: "text-destructive", review: "text-accent-foreground", none: "text-muted-foreground" };
const LABEL = { pass: "Passed", fail: "Failed", review: "Needs review", none: "Not done" };
const yn = (v: boolean | null | undefined) => (v == null ? "—" : v ? "Yes" : "No");

function Status({ s }: { s: ReviewStatus | undefined }) {
  const t = s ?? "none"; const I = ICON[t];
  return <span className={`flex items-center gap-1 text-sm ${COLOR[t]}`}><I className="h-4 w-4" />{LABEL[t]}</span>;
}
function Card({ title, s, children }: { title: string; s?: ReviewStatus; children?: React.ReactNode }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="mb-3 flex items-center justify-between gap-2"><h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3><Status s={s} /></div>
      {children}
    </div>
  );
}
function Row({ k, v }: { k: string; v: unknown }) {
  return <div><dt className="text-xs text-muted-foreground">{k}</dt><dd className="text-sm">{v == null || v === "" ? "—" : String(v)}</dd></div>;
}
const Grid = ({ children }: { children: React.ReactNode }) => <dl className="grid grid-cols-2 gap-3">{children}</dl>;

/** Full verification session review (display only). Photos load on demand and are never stored. */
export function KycReviewPanel({ rd, checkId }: { rd: ReviewDetails; checkId: string | null }) {
  const imgs = useServerFn(verificationImagesFn);
  const [images, setImages] = useState<Array<{ label: string; url: string }> | null>(null);
  const m = useMutation({
    mutationFn: () => imgs({ data: { checkId: checkId! } }),
    onSuccess: (r) => { setImages(r); if (!r.length) toast.message("No photos are available for this session."); },
    onError: (e: Error) => toast.error(e.message),
  });
  const id = rd.idDocument;
  return (
    <div className="space-y-4">
      <Card title={`Verification session${rd.sessionNumber ? ` #${rd.sessionNumber}` : ""}`} s={rd.status ? (/approv/i.test(rd.status) ? "pass" : /declin/i.test(rd.status) ? "fail" : "review") : "none"}>
        <Grid>
          <Row k="Provider result" v={rd.status} />
          <Row k="Started" v={rd.createdAt ? new Date(rd.createdAt).toLocaleString() : null} />
          <Row k="Steps" v={rd.features.map((f) => f.replace(/_/g, " ").toLowerCase()).join(", ")} />
          <Row k="Details refreshed" v={new Date(rd.capturedAt).toLocaleString()} />
        </Grid>
        {!!rd.warnings.length && <ul className="mt-3 list-disc pl-5 text-xs text-destructive">{rd.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
        {checkId && <div className="mt-3 print:hidden"><Button size="sm" variant="outline" disabled={m.isPending} onClick={() => m.mutate()}><ImageIcon className="mr-1 h-4 w-4" />{images ? "Refresh photos" : "Show ID and selfie photos"}</Button></div>}
        {images && !!images.length && (
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">{images.map((i) => (
            <figure key={i.label} className="space-y-1"><img src={i.url} alt={i.label} referrerPolicy="no-referrer" className="h-32 w-full rounded-md border object-cover" /><figcaption className="text-xs text-muted-foreground">{i.label}</figcaption></figure>
          ))}</div>
        )}
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        {id && <Card title="ID document" s={id.status}>
          <Grid>
            <Row k="Type" v={[id.type, id.subtype].filter(Boolean).join(" · ")} />
            <Row k="Number" v={id.numberLast4 ? `••••${id.numberLast4}` : null} />
            <Row k="Name on ID" v={id.fullName} />
            <Row k="Date of birth" v={id.dateOfBirth ? `${id.dateOfBirth}${id.age ? ` (age ${id.age})` : ""}` : null} />
            <Row k="Issued" v={id.issued} />
            <Row k="Expires" v={id.expires} />
            <Row k="Country / state" v={[id.country, id.region].filter(Boolean).join(" · ")} />
            <Row k="Barcodes read" v={id.barcodes.join(", ")} />
            <div className="col-span-2"><Row k={`Address on ID${id.addressVerified ? " (verified)" : ""}`} v={id.address} /></div>
          </Grid>
        </Card>}
        {(rd.liveness || rd.faceMatch) && <Card title="Liveness & face match" s={[rd.liveness?.status, rd.faceMatch?.status].includes("fail") ? "fail" : [rd.liveness?.status, rd.faceMatch?.status].every((x) => x === "pass") ? "pass" : "review"}>
          <Grid>
            <Row k="Liveness" v={rd.liveness ? `${rd.liveness.raw ?? "—"}${rd.liveness.score != null ? ` · ${rd.liveness.score}%` : ""}` : "Not done"} />
            <Row k="Method" v={rd.liveness?.method?.toLowerCase()} />
            <Row k="Face match" v={rd.faceMatch ? `${rd.faceMatch.raw ?? "—"}${rd.faceMatch.score != null ? ` · ${rd.faceMatch.score}%` : ""}` : "Not done"} />
            <Row k="Estimated age" v={rd.liveness?.ageEstimate != null ? Math.round(rd.liveness.ageEstimate) : null} />
          </Grid>
        </Card>}
        {rd.aml && <Card title="Watchlist / AML" s={rd.aml.totalHits > 0 && rd.aml.status === "pass" ? "review" : rd.aml.status}>
          <p className="mb-2 text-sm">{rd.aml.totalHits} possible match{rd.aml.totalHits === 1 ? "" : "es"} · provider result {rd.aml.raw ?? "—"}</p>
          {!!rd.aml.hits.length && <ul className="max-h-72 space-y-2 overflow-auto print:max-h-none">{rd.aml.hits.map((h, i) => (
            <li key={i} className="rounded-md border px-3 py-2 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium text-sm">{h.caption ?? "Unnamed"}</span><span className="flex gap-1">{h.pep && <Badge variant="destructive">PEP</Badge>}{h.matchScore != null && <Badge variant="outline">Name match {h.matchScore}%</Badge>}{h.riskScore != null && <Badge variant="secondary">Risk {h.riskScore}</Badge>}</span></div>
              <p className="text-muted-foreground">{[h.datasets.join(", "), h.lists.join(", "), h.countries.join(", "), h.birthDates.length ? `Born ${h.birthDates.join(", ")}` : "No birth date on record"].filter(Boolean).join(" · ")}</p>
              {h.summary && <p>{h.summary}</p>}
            </li>))}</ul>}
        </Card>}
        {rd.email && <Card title="Email check" s={rd.email.status}>
          <Grid><Row k="Email" v={rd.email.email} /><Row k="Disposable" v={yn(rd.email.disposable)} /><Row k="Found in data breaches" v={yn(rd.email.breached)} /><Row k="Breaches" v={rd.email.breaches.join("; ")} /></Grid>
        </Card>}
        {rd.phone && <Card title="Phone check" s={rd.phone.status}><Grid><Row k="Number" v={rd.phone.numberLast4 ? `••••${rd.phone.numberLast4}` : null} /><Row k="Carrier" v={rd.phone.carrier} /><Row k="Type" v={rd.phone.type} /></Grid></Card>}
        {rd.address && <Card title="Proof of address" s={rd.address.status}><Grid><div className="col-span-2"><Row k="Address" v={rd.address.address} /></div></Grid></Card>}
        {rd.device && <Card title="Device & IP" s={rd.device.status}>
          <Grid>
            <Row k="IP address" v={rd.device.ip} /><Row k="Location" v={[rd.device.city, rd.device.state, rd.device.country].filter(Boolean).join(", ")} />
            <Row k="Network" v={rd.device.isp} /><Row k="VPN / Tor / data center" v={`${yn(rd.device.vpnOrTor)} / ${yn(rd.device.dataCenter)}`} />
            <Row k="Device" v={[rd.device.device, rd.device.os, rd.device.browser].filter(Boolean).join(" · ")} />
            <Row k="Distance from ID address" v={rd.device.distanceFromIdKm != null ? `${Math.round(rd.device.distanceFromIdKm)} km` : null} />
          </Grid>
        </Card>}
        {rd.expected && <Card title="Details we sent to compare"><Grid>{Object.entries(rd.expected).map(([k, v]) => <Row key={k} k={k.replace(/_/g, " ")} v={v} />)}</Grid></Card>}
        {!!rd.questionnaire.length && <Card title="Questionnaire"><Grid>{rd.questionnaire.map((q, i) => <div key={i} className="col-span-2"><Row k={q.question} v={q.answer} /></div>)}</Grid></Card>}
        {!!rd.reviews.length && <Card title="Provider review history"><ul className="space-y-1 text-sm">{rd.reviews.map((r, i) => <li key={i}>{r.at ? new Date(r.at).toLocaleString() : ""} · {r.newStatus} {r.comment ? `— ${r.comment}` : ""}</li>)}</ul></Card>}
      </div>
    </div>
  );
}
