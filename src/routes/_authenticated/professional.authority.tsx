import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AUTHORITY_DOCUMENT_LABELS,
  AUTHORITY_DOCUMENT_TYPES,
  AUTHORITY_REVIEW_LABELS,
  SIGNABLE_DOCUMENT_LABELS,
  SIGNABLE_DOCUMENT_TYPES,
  type AuthorityDocumentType,
  type AuthorityReviewStatus,
  type SignableDocumentType,
} from "@/lib/signatory-model";
import { supabase } from "@/integrations/supabase/client";
import {
  listAuthorityDocs,
  startAuthorityUpload,
  submitAuthorityDoc,
} from "@/lib/signatory.functions";
import { listDelegationsAwaitingAcceptance } from "@/lib/signatory.functions";
import { listMyProfessionalClients } from "@/lib/professional.functions";

function AuthorityDocuments() {
  const loadDocs = useServerFn(listAuthorityDocs);
  const loadClients = useServerFn(listMyProfessionalClients);
  const loadPending = useServerFn(listDelegationsAwaitingAcceptance);
  const submit = useServerFn(submitAuthorityDoc);
  const qc = useQueryClient();

  const startUpload = useServerFn(startAuthorityUpload);

  const [delegationId, setDelegationId] = useState("");
  const [docType, setDocType] = useState<AuthorityDocumentType>("power_of_attorney");
  const [file, setFile] = useState<File | null>(null);
  const [expires, setExpires] = useState("");
  const [covered, setCovered] = useState<SignableDocumentType[]>([]);

  const { data: docs } = useQuery({
    queryKey: ["authority-documents", "delegate"],
    queryFn: () => loadDocs({ data: { as_principal: false } }),
    staleTime: 0,
  });
  const { data: clients } = useQuery({
    queryKey: ["professional-clients"],
    queryFn: () => loadClients(),
    staleTime: 0,
  });
  const { data: pending } = useQuery({
    queryKey: ["delegations-awaiting-acceptance"],
    queryFn: () => loadPending(),
    staleTime: 0,
  });

  const options = [
    ...((clients?.clients ?? []) as any[]).map((c) => ({
      id: c.delegationId,
      label: `${c.principalName ?? "Client"}${c.organizationName ? ` · ${c.organizationName}` : ""}`,
    })),
    ...((pending?.items ?? []) as any[]).map((p) => ({
      id: p.delegationId,
      label: `${p.principalName} (awaiting acceptance)`,
    })),
  ].filter((o, i, all) => all.findIndex((x) => x.id === o.id) === i);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Choose the authority document first.");
      const ticket = await startUpload({
        data: { delegation_id: delegationId, file_name: file.name },
      });
      if (!ticket.signedUrl || !ticket.token) throw new Error("Could not start that upload.");

      const { error } = await supabase.storage
        .from("authority-documents")
        .uploadToSignedUrl(ticket.path, ticket.token, file);
      if (error) throw new Error(error.message);

      const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
      const hash = Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      return submit({
        data: {
          delegation_id: delegationId,
          document_type: docType,
          file_name: file.name,
          storage_path: ticket.path,
          document_hash: hash,
          covered_document_types: covered,
          expires_at: expires || null,
        },
      });
    },
    onSuccess: () => {
      toast.success("Submitted for review.");
      setFile(null);
      setCovered([]);
      void qc.invalidateQueries({ queryKey: ["authority-documents", "delegate"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not submit that."),
  });

  const rows = (docs?.documents ?? []) as any[];

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Signing on a client's behalf always needs written legal authority on file — a power of
        attorney, resolution, trustee authorisation or similar. Uploading one is not enough: Harmonious
        reviews it, and signing only becomes possible once it is accepted.
      </p>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Submit authority</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Client authorisation</Label>
              <Select value={delegationId} onValueChange={setDelegationId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose" />
                </SelectTrigger>
                <SelectContent>
                  {options.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Document type</Label>
              <Select value={docType} onValueChange={(v) => setDocType(v as AuthorityDocumentType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AUTHORITY_DOCUMENT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {AUTHORITY_DOCUMENT_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs" htmlFor="auth-file">
                Authority document
              </Label>
              <Input
                id="auth-file"
                type="file"
                accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <p className="text-xs text-muted-foreground">
                Kept private. Only you, your client and Harmonious can open it, through a link that
                lasts a minute.
              </p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs" htmlFor="auth-expires">
                Expires
              </Label>
              <Input
                id="auth-expires"
                type="date"
                value={expires}
                onChange={(e) => setExpires(e.target.value)}
              />
            </div>
          </div>

          <div>
            <p className="text-xs text-muted-foreground">Documents this authority covers</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {SIGNABLE_DOCUMENT_TYPES.map((t) => (
                <label key={t} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={covered.includes(t)}
                    onCheckedChange={(checked) =>
                      setCovered((prev) =>
                        checked ? [...prev, t] : prev.filter((x) => x !== t),
                      )
                    }
                  />
                  {SIGNABLE_DOCUMENT_LABELS[t]}
                </label>
              ))}
            </div>
          </div>

          <Button
            disabled={
              mutation.isPending || !delegationId || !fileName || covered.length === 0
            }
            onClick={() => mutation.mutate()}
          >
            Submit for review
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Authority on file</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing submitted yet.</p>
          ) : null}
          {rows.map((d) => (
            <div
              key={d.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3"
            >
              <div>
                <p className="text-sm font-medium">
                  {AUTHORITY_DOCUMENT_LABELS[d.document_type as AuthorityDocumentType] ??
                    d.document_type}{" "}
                  · {d.file_name}
                </p>
                <p className="text-xs text-muted-foreground">
                  Covers{" "}
                  {(d.covered_document_types ?? [])
                    .map(
                      (t: string) =>
                        SIGNABLE_DOCUMENT_LABELS[t as SignableDocumentType] ?? t,
                    )
                    .join(", ") || "—"}
                  {d.expires_at ? ` · expires ${new Date(d.expires_at).toLocaleDateString()}` : ""}
                </p>
              </div>
              <Badge variant={d.review_status === "accepted" ? "default" : "secondary"}>
                {AUTHORITY_REVIEW_LABELS[d.review_status as AuthorityReviewStatus] ??
                  d.review_status}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/professional/authority")({
  head: () => ({
    meta: [
      { title: "Authority documents — Harmonious" },
      {
        name: "description",
        content:
          "Submit powers of attorney, resolutions and trustee authorisations that permit delegated signing.",
      },
      { property: "og:title", content: "Authority documents — Harmonious" },
      { property: "og:description", content: "Documented legal authority for delegated signing." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthorityDocuments,
});
