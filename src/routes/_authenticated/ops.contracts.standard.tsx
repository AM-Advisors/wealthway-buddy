import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { z } from "zod";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { STANDARD_FIELDS } from "@/lib/contract-intelligence";
import {
  approveStandardAgreementPreview,
  getStandardAgreementSetup,
  saveStandardAgreementDraft,
  sendStandardAgreement,
  syncStandardAgreementExecution,
} from "@/lib/contract-intelligence.functions";

export const Route = createFileRoute("/_authenticated/ops/contracts/standard")({
  validateSearch: z.object({ clientId: z.string().uuid(), draftId: z.string().uuid().optional() }),
  head: () => ({
    meta: [
      { title: "Harmonious Standard Agreement — Harmonious operations" },
      { name: "description", content: "Prepare a client agreement from an approved Harmonious template version." },
      { property: "og:title", content: "Harmonious Standard Agreement — Harmonious operations" },
      { property: "og:description", content: "Approved template, reviewed preview, signing handoff." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: StandardAgreement,
});

const STATUS: Record<string, string> = {
  draft: "Draft — awaiting Harmonious review",
  approved_to_send: "Reviewed — ready to send",
  sent: "Sent for signature — not executed",
  executed: "Executed (confirmed by signing workflow)",
};

function StandardAgreement() {
  const { clientId, draftId } = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const load = useServerFn(getStandardAgreementSetup);
  const save = useServerFn(saveStandardAgreementDraft);
  const approve = useServerFn(approveStandardAgreementPreview);
  const send = useServerFn(sendStandardAgreement);
  const sync = useServerFn(syncStandardAgreementExecution);
  const q = useQuery({ queryKey: ["standard-agreement", clientId, draftId], queryFn: () => load({ data: { clientId, draftId: draftId ?? null } }) });
  const [versionId, setVersionId] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [serviceKeys, setServiceKeys] = useState<string[]>([]);

  useEffect(() => {
    const d = q.data as any;
    if (!d) return;
    setVersionId(d.draft?.msa_version_id ?? d.versions[0]?.id ?? "");
    setFields({ ...d.defaults, ...(d.draft?.standard_fields ?? {}) });
    setServiceKeys(d.draft?.applies_to_service_keys ?? []);
  }, [q.data]);

  if (q.isPending) return <Skeleton className="m-6 h-96" />;
  if (q.error) return <p className="p-6 text-sm text-muted-foreground">{(q.error as Error).message}</p>;
  const d = q.data as any;
  const status = d.draft?.standard_status as string | undefined;
  const editable = !status || status === "draft" || status === "approved_to_send";
  const refresh = () => qc.invalidateQueries({ queryKey: ["standard-agreement", clientId] });
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); toast.success(ok); refresh(); } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <div className="space-y-4 px-4 py-6">
      <Link to="/ops/clients/$clientId" params={{ clientId }} search={{ tab: "contracts" } as any} className="text-sm text-muted-foreground underline">
        ← {d.client.name}
      </Link>
      <h1 className="text-2xl">Harmonious Standard Agreement</h1>
      <p className="text-sm text-muted-foreground">
        Uses an approved template version exactly as written. Only the listed business fields are filled in; the legal language is never altered. Sending does not make it executed.
      </p>
      {status ? <Badge>{STATUS[status] ?? status}</Badge> : null}

      {d.versions.length === 0 ? (
        <Card><CardHeader><CardTitle className="text-base">No approved template</CardTitle>
          <CardDescription>Publish a template version in Agreements & SOW first. Unapproved templates can't be used.</CardDescription></CardHeader></Card>
      ) : (
        <Card>
          <CardHeader><CardTitle className="text-base">1. Template, client and scope</CardTitle></CardHeader>
          <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
            <label className="space-y-1 sm:col-span-2"><span className="font-medium">Approved template version</span>
              <select disabled={!editable} className="h-10 w-full rounded-md border bg-background px-3" value={versionId} onChange={(e) => setVersionId(e.target.value)}>
                {d.versions.map((v: any) => <option key={v.id} value={v.id}>Version {v.version} · effective {v.effective_date}</option>)}
              </select>
            </label>
            {STANDARD_FIELDS.map((f) => (
              <label key={f.key} className="space-y-1"><span className="font-medium">{f.label}{f.required ? " *" : ""}</span>
                <Input disabled={!editable} type={f.key === "effective_date" ? "date" : "text"} value={fields[f.key] ?? ""} onChange={(e) => setFields({ ...fields, [f.key]: e.target.value })} />
              </label>
            ))}
            <div className="sm:col-span-2">
              <p className="mb-1 font-medium">Applicable services</p>
              <div className="flex flex-wrap gap-3">
                {d.services.map((s: any) => (
                  <label key={s.key} className="flex items-center gap-1">
                    <input type="checkbox" disabled={!editable} checked={serviceKeys.includes(s.key)}
                      onChange={(e) => {
                        const next = e.target.checked ? [...serviceKeys, s.key] : serviceKeys.filter((x) => x !== s.key);
                        setServiceKeys(next);
                        setFields({ ...fields, services: d.services.filter((x: any) => next.includes(x.key)).map((x: any) => x.name).join(", ") });
                      }} />
                    {s.name}
                  </label>
                ))}
              </div>
            </div>
            {editable ? (
              <div className="sm:col-span-2">
                <Button onClick={async () => {
                  try {
                    const r = await save({ data: { clientId, draftId: draftId ?? null, msaVersionId: versionId, fields: fields as any, serviceKeys } });
                    toast.success("Draft saved — preview below");
                    navigate({ to: "/ops/contracts/standard", search: { clientId, draftId: r.draftId } });
                    refresh();
                  } catch (e) { toast.error((e as Error).message); }
                }}>Save draft & preview</Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}

      {d.preview ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">2. Preview</CardTitle>
            <CardDescription>
              {d.preview.missing.length ? `Missing: ${d.preview.missing.join(", ")}. ` : ""}
              {d.preview.unknownPlaceholders.length ? `Template placeholders left as written: ${d.preview.unknownPlaceholders.join(", ")}.` : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="max-h-[60vh] space-y-3 overflow-auto text-sm">
            {d.preview.sections.map((s: any) => (
              <div key={s.section_no}><p className="font-medium">§{s.section_no} {s.title}</p><p className="whitespace-pre-wrap">{s.body}</p></div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {d.draft ? (
        <Card>
          <CardHeader><CardTitle className="text-base">3. Review, send, execution</CardTitle>
            <CardDescription>
              A different authorized Harmonious reviewer approves the preview. Sending hands it to the existing client signing workflow in the client portal.
              It becomes the client's governing document only when that workflow records execution. Live Box sending for standard agreements isn't connected yet.
            </CardDescription></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {status === "draft" && d.mayApprovePreview ? (
              <Button variant="outline" disabled={d.draft.standard_prepared_by === d.userId} onClick={() => act(() => approve({ data: { draftId: d.draft.id } }), "Preview approved")}>
                {d.draft.standard_prepared_by === d.userId ? "Another person must review" : "Approve preview"}
              </Button>
            ) : null}
            {status === "approved_to_send" ? (
              <Button disabled={d.preview?.blockers?.length > 0} onClick={() => act(() => send({ data: { draftId: d.draft.id } }), "Sent for signature")}>Send for signature</Button>
            ) : null}
            {status === "sent" ? (
              <Button variant="outline" onClick={() => act(async () => {
                const r = await sync({ data: { draftId: d.draft.id } });
                if (!r.executed) throw new Error("Not signed yet — the signing workflow hasn't recorded execution.");
              }, "Execution confirmed — terms ready for review")}>Check signing status</Button>
            ) : null}
            {status === "executed" ? (
              <Button asChild><Link to="/ops/contracts/$documentId" params={{ documentId: d.draft.id }}>Review template terms & approve</Link></Button>
            ) : null}
            {d.preview?.blockers?.length && status === "approved_to_send" ? <p className="w-full text-xs text-muted-foreground">{d.preview.blockers.join(" ")}</p> : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
