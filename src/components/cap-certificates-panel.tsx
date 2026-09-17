import { useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import {
  attachCertificateFile,
  cancelCertificate,
  certificateFileUrl,
  createHolderLink,
  inviteShareholder,
  listCertificates,
  revokeHolderAccess,
  signCertificate,
} from "@/lib/cap-certificates.functions";
import { downloadCertificate } from "@/components/certificate-document";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const statusTone: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  issued: "default",
  draft: "secondary",
  cancelled: "destructive",
  replaced: "outline",
};

type Stakeholder = { id: string; name: string; email?: string | null };

export function CapCertificatesPanel({
  clientId,
  stakeholders,
}: {
  clientId: string;
  stakeholders: Stakeholder[];
}) {
  const load = useServerFn(listCertificates);
  const sign = useServerFn(signCertificate);
  const attach = useServerFn(attachCertificateFile);
  const fileUrl = useServerFn(certificateFileUrl);
  const cancel = useServerFn(cancelCertificate);
  const invite = useServerFn(inviteShareholder);
  const makeLink = useServerFn(createHolderLink);
  const revoke = useServerFn(revokeHolderAccess);

  const queryClient = useQueryClient();
  const queryKey = ["cap-certificates", clientId];
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => load({ data: { clientId } }),
  });
  const refresh = () => void queryClient.invalidateQueries({ queryKey });

  const [signing, setSigning] = useState<string | null>(null);
  const [signer, setSigner] = useState({ name: "", title: "" });
  const [inviteFor, setInviteFor] = useState({ stakeholderId: "", email: "" });
  const [linkDays, setLinkDays] = useState("30");
  const [linkFor, setLinkFor] = useState("");
  const [lastLink, setLastLink] = useState<string | null>(null);

  const certificates = data?.certificates ?? [];
  const access = data?.access ?? [];
  const canSign = Boolean(data?.canSign);
  const canEdit = Boolean(data?.canEdit);
  const holderName = (id: string) => stakeholders.find((s) => s.id === id)?.name ?? "Shareholder";

  const signMutation = useMutation({
    mutationFn: (id: string) =>
      sign({ data: { clientId, id, signerName: signer.name, signerTitle: signer.title || null } }),
    onSuccess: () => {
      toast.success("Certificate signed and issued.");
      setSigning(null);
      setSigner({ name: "", title: "" });
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not sign that certificate."),
  });

  const cancelMutation = useMutation({
    mutationFn: (args: { id: string; reason: string; reissue: boolean }) =>
      cancel({ data: { clientId, ...args } }),
    onSuccess: () => {
      toast.success("Certificate updated.");
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not update that certificate."),
  });

  const inviteMutation = useMutation({
    mutationFn: () =>
      invite({
        data: {
          clientId,
          stakeholderId: inviteFor.stakeholderId,
          email: inviteFor.email.trim(),
        },
      }),
    onSuccess: (r: any) => {
      toast.success(
        r?.delivery === "sent"
          ? "Invitation sent."
          : "Access granted, but the email could not be delivered.",
      );
      setInviteFor({ stakeholderId: "", email: "" });
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not invite that shareholder."),
  });

  const linkMutation = useMutation({
    mutationFn: () =>
      makeLink({
        data: { clientId, stakeholderId: linkFor, days: Number(linkDays) || 30 },
      }),
    onSuccess: (r: any) => {
      setLastLink(r?.url ?? null);
      toast.success("Private link created.");
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not create that link."),
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => revoke({ data: { clientId, id } }),
    onSuccess: () => {
      toast.success("Access withdrawn.");
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not withdraw that access."),
  });

  async function uploadSigned(certificateId: string, file: File) {
    const path = `${clientId}/${certificateId}-${file.name.replace(/[^A-Za-z0-9.\-_]/g, "_")}`;
    const { error } = await supabase.storage
      .from("cap-certificates")
      .upload(path, file, { upsert: true });
    if (error) {
      toast.error(error.message);
      return;
    }
    try {
      await attach({ data: { clientId, id: certificateId, path, fileName: file.name } });
      toast.success("Signed copy attached.");
      refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not attach that file.");
    }
  }

  async function openSigned(id: string) {
    try {
      const r = await fileUrl({ data: { clientId, id } });
      if (r?.url) window.open(r.url, "_blank", "noopener");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not open that file.");
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Share certificates</CardTitle>
          <CardDescription>
            Every share record gets its own numbered certificate. A signatory on this account signs
            it before it is issued, and you can attach your own signed copy.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading certificates…</p>
          ) : certificates.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No certificates yet. Add shares and a certificate is created for each one.
            </p>
          ) : (
            certificates.map((c: any) => (
              <div key={c.id} className="rounded-md border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">
                      {c.certificate_no} · {c.snapshot?.holderName || holderName(c.stakeholder_id)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {Number(c.snapshot?.quantity ?? 0).toLocaleString("en-US")}{" "}
                      {c.snapshot?.shareClass || c.snapshot?.securityType} · code{" "}
                      {c.verification_code}
                    </p>
                  </div>
                  <Badge variant={statusTone[c.status] ?? "outline"}>{c.status}</Badge>
                </div>

                {c.status === "issued" ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Signed by {c.signer_name}
                    {c.signer_title ? `, ${c.signer_title}` : ""} on{" "}
                    {new Date(c.signed_at).toLocaleDateString()}.
                  </p>
                ) : null}
                {c.cancelled_reason ? (
                  <p className="mt-2 text-sm text-muted-foreground">{c.cancelled_reason}</p>
                ) : null}

                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void downloadCertificate(c)}
                  >
                    Download
                  </Button>
                  {c.file_path ? (
                    <Button size="sm" variant="outline" onClick={() => void openSigned(c.id)}>
                      Open signed copy
                    </Button>
                  ) : null}
                  {canEdit ? (
                    <label className="inline-flex cursor-pointer items-center rounded-md border px-3 text-sm leading-8">
                      Upload signed copy
                      <input
                        type="file"
                        className="hidden"
                        accept=".pdf,.png,.jpg,.jpeg"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) void uploadSigned(c.id, file);
                          e.target.value = "";
                        }}
                      />
                    </label>
                  ) : null}
                  {canSign && c.status === "draft" ? (
                    <Button size="sm" onClick={() => setSigning(signing === c.id ? null : c.id)}>
                      Sign and issue
                    </Button>
                  ) : null}
                  {canSign && ["draft", "issued"].includes(c.status) ? (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={cancelMutation.isPending}
                        onClick={() => {
                          const reason = window.prompt("Why is this certificate being reissued?");
                          if (reason)
                            cancelMutation.mutate({ id: c.id, reason, reissue: true });
                        }}
                      >
                        Reissue
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={cancelMutation.isPending}
                        onClick={() => {
                          const reason = window.prompt("Why is this certificate being cancelled?");
                          if (reason)
                            cancelMutation.mutate({ id: c.id, reason, reissue: false });
                        }}
                      >
                        Cancel
                      </Button>
                    </>
                  ) : null}
                </div>

                {signing === c.id ? (
                  <div className="mt-3 grid gap-3 rounded-md bg-muted/40 p-3 sm:grid-cols-3">
                    <div className="space-y-1">
                      <Label htmlFor={`sn-${c.id}`}>Your full name</Label>
                      <Input
                        id={`sn-${c.id}`}
                        value={signer.name}
                        onChange={(e) => setSigner({ ...signer, name: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`st-${c.id}`}>Title</Label>
                      <Input
                        id={`st-${c.id}`}
                        value={signer.title}
                        onChange={(e) => setSigner({ ...signer, title: e.target.value })}
                      />
                    </div>
                    <div className="flex items-end">
                      <Button
                        size="sm"
                        disabled={signer.name.trim().length < 2 || signMutation.isPending}
                        onClick={() => signMutation.mutate(c.id)}
                      >
                        {signMutation.isPending ? "Signing…" : "Sign certificate"}
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Shareholder access</CardTitle>
          <CardDescription>
            Invite a shareholder to sign in, or hand them a private link that expires. Either way
            they see only their own shares and certificates, and can change nothing.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {canEdit ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor="inv-holder">Shareholder</Label>
                <select
                  id="inv-holder"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={inviteFor.stakeholderId}
                  onChange={(e) => {
                    const s = stakeholders.find((x) => x.id === e.target.value);
                    setInviteFor({
                      stakeholderId: e.target.value,
                      email: s?.email ?? inviteFor.email,
                    });
                    setLinkFor(e.target.value);
                  }}
                >
                  <option value="">Choose…</option>
                  {stakeholders.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="inv-email">Their email</Label>
                <Input
                  id="inv-email"
                  type="email"
                  value={inviteFor.email}
                  onChange={(e) => setInviteFor({ ...inviteFor, email: e.target.value })}
                />
              </div>
              <div className="flex items-end gap-2">
                <Button
                  size="sm"
                  disabled={
                    !inviteFor.stakeholderId || !inviteFor.email.trim() || inviteMutation.isPending
                  }
                  onClick={() => inviteMutation.mutate()}
                >
                  {inviteMutation.isPending ? "Sending…" : "Invite to portal"}
                </Button>
              </div>

              <div className="space-y-1">
                <Label htmlFor="link-days">Private link valid for (days)</Label>
                <Input
                  id="link-days"
                  inputMode="numeric"
                  value={linkDays}
                  onChange={(e) => setLinkDays(e.target.value)}
                />
              </div>
              <div className="flex items-end">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!linkFor || linkMutation.isPending}
                  onClick={() => linkMutation.mutate()}
                >
                  {linkMutation.isPending ? "Creating…" : "Create private link"}
                </Button>
              </div>
            </div>
          ) : null}

          {lastLink ? (
            <div className="rounded-md border bg-muted/40 p-3 text-sm break-all">
              <p className="mb-1 font-medium">Copy this link now — it is shown once.</p>
              {lastLink}
            </div>
          ) : null}

          {access.length === 0 ? (
            <p className="text-sm text-muted-foreground">No shareholder access granted yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Shareholder</th>
                    <th className="py-2 pr-3 font-medium">Access</th>
                    <th className="py-2 pr-3 font-medium">Status</th>
                    <th className="py-2 pr-3 font-medium">Opened</th>
                    <th className="py-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {access.map((a: any) => {
                    const expired = a.expires_at && new Date(a.expires_at) < new Date();
                    return (
                      <tr key={a.id} className="border-b last:border-0">
                        <td className="py-2 pr-3">{holderName(a.stakeholder_id)}</td>
                        <td className="py-2 pr-3">
                          {a.kind === "login" ? `Portal login (${a.email ?? ""})` : "Private link"}
                        </td>
                        <td className="py-2 pr-3">
                          {a.revoked_at ? "Withdrawn" : expired ? "Expired" : "Active"}
                        </td>
                        <td className="py-2 pr-3">
                          {a.view_count ? `${a.view_count}×` : "—"}
                          {a.last_seen_at
                            ? ` · ${new Date(a.last_seen_at).toLocaleDateString()}`
                            : ""}
                        </td>
                        <td className="py-2 text-right">
                          {canEdit && !a.revoked_at ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => revokeMutation.mutate(a.id)}
                            >
                              Withdraw
                            </Button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
