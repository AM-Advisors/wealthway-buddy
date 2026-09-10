import { useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import {
  POLICY_KINDS,
  listPolicyAcceptances,
  listPolicyDocuments,
  savePolicyDocument,
} from "@/lib/policies.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Draft = {
  id?: string;
  kind: string;
  title: string;
  body: string;
  effectiveDate: string;
  newVersion: boolean;
};

export function PolicyDocumentsBoard() {
  const fetchDocs = useServerFn(listPolicyDocuments);
  const save = useServerFn(savePolicyDocument);
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);

  const { data, isPending } = useQuery({
    queryKey: ["policy-documents"],
    queryFn: () => fetchDocs(),
  });

  const mutate = useMutation({
    mutationFn: (d: Draft) =>
      save({
        data: {
          id: d.id,
          kind: d.kind as any,
          title: d.title,
          body: d.body,
          effectiveDate: d.effectiveDate,
          newVersion: d.newVersion,
          publish: true,
        },
      }),
    onSuccess: async () => {
      toast.success("Saved.");
      setDraft(null);
      await qc.invalidateQueries({ queryKey: ["policy-documents"] });
      await qc.invalidateQueries({ queryKey: ["policy-status"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not save that document."),
  });

  if (isPending) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const docs = (data?.documents ?? []) as any[];
  const canManage = Boolean(data?.canManage);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {canManage
          ? "Everyone signing in accepts these before using the platform. Publishing a new version asks everyone again."
          : "Read-only. Policy documents are managed by super admins."}
      </p>

      {POLICY_KINDS.map((kind) => {
        const versions = docs.filter((d) => d.kind === kind.key);
        const live = versions.find((d) => d.published) ?? versions[0];
        return (
          <Card key={kind.key}>
            <CardContent className="space-y-3 pt-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">{live?.title ?? kind.label}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {live
                      ? `Version ${live.version} · in effect ${live.effective_date}`
                      : "Not written yet"}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {live?.published ? <Badge variant="secondary">Live</Badge> : <Badge variant="outline">Draft</Badge>}
                  {canManage && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setDraft({
                            id: live?.id,
                            kind: kind.key,
                            title: live?.title ?? kind.label,
                            body: live?.body ?? "",
                            effectiveDate:
                              live?.effective_date ?? new Date().toISOString().slice(0, 10),
                            newVersion: false,
                          })
                        }
                      >
                        Correct wording
                      </Button>
                      <Button
                        size="sm"
                        onClick={() =>
                          setDraft({
                            kind: kind.key,
                            title: live?.title ?? kind.label,
                            body: live?.body ?? "",
                            effectiveDate: new Date().toISOString().slice(0, 10),
                            newVersion: true,
                          })
                        }
                      >
                        Publish new version
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {draft && draft.kind === kind.key && (
                <div className="space-y-3 rounded-md border p-4">
                  <p className="text-sm font-medium">
                    {draft.newVersion
                      ? "New version — everyone will be asked to accept again."
                      : "Correcting the current version — nobody is asked again."}
                  </p>
                  <div className="space-y-1.5">
                    <Label>Title</Label>
                    <Input
                      value={draft.title}
                      onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>In effect from</Label>
                    <Input
                      type="date"
                      value={draft.effectiveDate}
                      onChange={(e) => setDraft({ ...draft, effectiveDate: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Wording</Label>
                    <Textarea
                      rows={12}
                      value={draft.body}
                      onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button disabled={mutate.isPending} onClick={() => mutate.mutate(draft)}>
                      {mutate.isPending ? "Saving…" : "Save"}
                    </Button>
                    <Button variant="outline" onClick={() => setDraft(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              {versions.length > 1 && (
                <p className="text-xs text-muted-foreground">
                  Earlier versions kept on record: {versions.filter((v) => !v.published).map((v) => `v${v.version}`).join(", ")}
                </p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export function PolicyAcceptancesBoard() {
  const fetchList = useServerFn(listPolicyAcceptances);
  const { data, isPending, isError, error } = useQuery({
    queryKey: ["policy-acceptances"],
    queryFn: () => fetchList(),
    retry: false,
  });

  if (isPending) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (isError) {
    return <p className="text-sm text-muted-foreground">{(error as any)?.message ?? "Not available."}</p>;
  }

  const rows = (data?.acceptances ?? []) as any[];

  function download() {
    const header = ["Accepted", "Person", "Email", "Document", "Version", "Signed name", "Address"];
    const body = rows.map((r) => [
      r.accepted_at,
      r.signer_name,
      r.email ?? "",
      POLICY_KINDS.find((k) => k.key === r.kind)?.label ?? r.kind,
      r.version,
      r.signer_name,
      r.ip_address ?? "",
    ]);
    const csv = [header, ...body]
      .map((line) => line.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "policy-acceptances.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {rows.length} acceptance{rows.length === 1 ? "" : "s"} on record.
        </p>
        <Button size="sm" variant="outline" onClick={download} disabled={!rows.length}>
          Download spreadsheet
        </Button>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="px-3 py-2 font-medium">Accepted</th>
              <th className="px-3 py-2 font-medium">Person</th>
              <th className="px-3 py-2 font-medium">Document</th>
              <th className="px-3 py-2 font-medium">Version</th>
              <th className="px-3 py-2 font-medium">Address</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-3 py-2">{new Date(r.accepted_at).toLocaleString()}</td>
                <td className="px-3 py-2">
                  {r.signer_name}
                  {r.email ? <span className="block text-xs text-muted-foreground">{r.email}</span> : null}
                </td>
                <td className="px-3 py-2">
                  {POLICY_KINDS.find((k) => k.key === r.kind)?.label ?? r.kind}
                </td>
                <td className="px-3 py-2">v{r.version}</td>
                <td className="px-3 py-2 text-muted-foreground">{r.ip_address ?? "—"}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td className="px-3 py-6 text-muted-foreground" colSpan={5}>
                  Nobody has accepted yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
