import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Copy, ExternalLink, FileText, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  createPacketLink,
  getOfferingPacket,
  revokePacketLink,
} from "@/lib/offering-packet.functions";
import { downloadOfferingPacket } from "@/lib/offering-documents.functions";

export const Route = createFileRoute("/_authenticated/admin/packet/$fundId")({
  head: () => ({
    meta: [
      { title: "Fund offering packet — Harmonious admin" },
      {
        name: "description",
        content:
          "Private offering packet for a Harmonious fund: documents, bank details and shareable investor download links.",
      },
      { property: "og:title", content: "Fund offering packet — Harmonious admin" },
      {
        property: "og:description",
        content: "Documents, bank details and shareable packet links for one fund.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PacketPage,
});

const WIRE_LABEL: Record<string, string> = {
  bank_name: "Bank name",
  bank_address: "Bank address",
  account_name: "Account name",
  account_number: "Account number",
  routing_number: "Routing number (ABA)",
  swift: "SWIFT / BIC",
  reference: "Reference",
  memo: "Memo",
};

function money(cents?: number | null) {
  if (cents == null) return "—";
  return `$${(cents / 100).toLocaleString("en-US")}`;
}

function when(value?: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

function PacketPage() {
  const { fundId } = Route.useParams();
  const load = useServerFn(getOfferingPacket);
  const create = useServerFn(createPacketLink);
  const revoke = useServerFn(revokePacketLink);
  const downloadPacket = useServerFn(downloadOfferingPacket);
  const queryClient = useQueryClient();

  const [label, setLabel] = useState("Investor packet");
  const [includeWire, setIncludeWire] = useState(true);
  const [expiryDays, setExpiryDays] = useState("30");
  const [downloading, setDownloading] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["offering-packet", fundId],
    queryFn: () => load({ data: { fundId } }),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      create({
        data: {
          fundId,
          label: label.trim(),
          include_wire: includeWire,
          expires_in_days: expiryDays === "never" ? null : Number(expiryDays),
        },
      }),
    onSuccess: () => {
      toast.success("Share link created");
      queryClient.invalidateQueries({ queryKey: ["offering-packet", fundId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not create the link."),
  });

  const revokeMutation = useMutation({
    mutationFn: (linkId: string) => revoke({ data: { linkId } }),
    onSuccess: () => {
      toast.success("Link turned off");
      queryClient.invalidateQueries({ queryKey: ["offering-packet", fundId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not turn off the link."),
  });

  function shareUrl(token: string) {
    const origin = typeof window === "undefined" ? "" : window.location.origin;
    return `${origin}/api/public/packet/${token}`;
  }

  async function copyLink(token: string) {
    try {
      await navigator.clipboard.writeText(shareUrl(token));
      toast.success("Link copied");
    } catch {
      toast.error("Could not copy — select the link manually.");
    }
  }

  async function downloadNow() {
    setDownloading(true);
    try {
      const res = await downloadPacket({ data: { offering_id: fundId } });
      const bytes = Uint8Array.from(atob(res.base64), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = res.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not build the packet.");
    } finally {
      setDownloading(false);
    }
  }

  const offering = data?.offering;
  const wireEntries = Object.entries(data?.wire.details ?? {}).filter(
    ([, v]) => String(v ?? "").trim() !== "",
  );

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-6">
      <header className="space-y-2">
        <p className="text-sm font-medium text-muted-foreground">Harmonious · private packet</p>
        <h1 className="font-heading text-3xl font-semibold text-foreground">
          {offering?.name ?? "Fund offering packet"}
        </h1>
        <p className="text-muted-foreground">
          Everything an investor receives for this fund, plus links you can share that always serve
          the latest version.
        </p>
      </header>

      {isLoading ? (
        <Card>
          <CardContent className="p-6 text-muted-foreground">Loading the packet…</CardContent>
        </Card>
      ) : !offering ? (
        <Card>
          <CardContent className="p-6 text-muted-foreground">This fund is not available.</CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <CardTitle className="text-lg">Fund summary</CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{String(offering.reg_type).toUpperCase()}</Badge>
                <Badge variant={offering.is_open ? "default" : "outline"}>
                  {offering.is_open ? "Open" : "Closed"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {offering.summary ? (
                <p className="text-muted-foreground">{offering.summary}</p>
              ) : null}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Minimum</p>
                  <p className="font-medium">{money(offering.min_investment_cents)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Target raise
                  </p>
                  <p className="font-medium">{money(offering.target_raise_cents)}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button onClick={downloadNow} disabled={downloading}>
                  {downloading ? "Building…" : "Download packet (PDF)"}
                </Button>
                <Button asChild variant="outline">
                  <Link to="/admin/fund/$fundId" params={{ fundId }}>
                    Open fund page
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                Offering documents ({data?.documents.length ?? 0})
              </CardTitle>
            </CardHeader>
            <CardContent className="divide-y">
              {(data?.documents ?? []).length === 0 ? (
                <p className="py-2 text-muted-foreground">
                  No documents yet. Add them on the fund page.
                </p>
              ) : (
                (data?.documents ?? []).map((doc: any) => (
                  <div key={doc.id} className="flex items-center justify-between gap-4 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <p className="truncate font-medium">{doc.title}</p>
                        <p className="text-sm text-muted-foreground">{doc.doc_type}</p>
                      </div>
                    </div>
                    {doc.requires_signature ? (
                      <Badge variant="secondary">Signature required</Badge>
                    ) : (
                      <Badge variant="outline">Reference</Badge>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Bank details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {wireEntries.length === 0 ? (
                <p className="text-muted-foreground">
                  No bank details saved yet. Add them in Admin → Funds.
                </p>
              ) : (
                <div className="divide-y">
                  {wireEntries.map(([key, value]) => (
                    <div key={key} className="py-2">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        {WIRE_LABEL[key] ?? key}
                      </p>
                      <p className="break-words font-medium">{String(value)}</p>
                    </div>
                  ))}
                </div>
              )}
              {data?.wire.updatedAt ? (
                <p className="text-sm text-muted-foreground">
                  Last changed {when(data.wire.updatedAt)}
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Shareable download links</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <Label htmlFor="packet-label">Link name</Label>
                  <Input
                    id="packet-label"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="Investor packet"
                  />
                </div>
                <div>
                  <Label htmlFor="packet-expiry">Expires after</Label>
                  <select
                    id="packet-expiry"
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={expiryDays}
                    onChange={(e) => setExpiryDays(e.target.value)}
                  >
                    <option value="7">7 days</option>
                    <option value="30">30 days</option>
                    <option value="90">90 days</option>
                    <option value="never">No expiry</option>
                  </select>
                </div>
              </div>
              <div className="flex items-center justify-between gap-4 rounded-md border p-3">
                <div>
                  <p className="font-medium">Include bank details</p>
                  <p className="text-sm text-muted-foreground">
                    Leave this off when sharing with prospects who haven't been approved to fund.
                  </p>
                </div>
                <Switch checked={includeWire} onCheckedChange={setIncludeWire} />
              </div>
              <Button
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending || label.trim().length < 2}
              >
                {createMutation.isPending ? "Creating…" : "Create share link"}
              </Button>

              <div className="divide-y">
                {(data?.links ?? []).length === 0 ? (
                  <p className="py-2 text-muted-foreground">No links yet.</p>
                ) : (
                  (data?.links ?? []).map((link: any) => {
                    const expired =
                      link.expires_at && new Date(link.expires_at).getTime() < Date.now();
                    const inactive = Boolean(link.revoked_at) || expired;
                    return (
                      <div key={link.id} className="space-y-2 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">{link.label}</p>
                          {link.include_wire ? (
                            <Badge variant="secondary">Includes bank details</Badge>
                          ) : (
                            <Badge variant="outline">Documents only</Badge>
                          )}
                          <Badge variant={inactive ? "outline" : "default"}>
                            {link.revoked_at ? "Turned off" : expired ? "Expired" : "Active"}
                          </Badge>
                        </div>
                        <p className="break-all text-sm text-muted-foreground">
                          {shareUrl(link.token)}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {link.download_count} download{link.download_count === 1 ? "" : "s"}
                          {link.last_downloaded_at ? ` · last ${when(link.last_downloaded_at)}` : ""}
                          {link.expires_at ? ` · expires ${when(link.expires_at)}` : " · no expiry"}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="outline" onClick={() => copyLink(link.token)}>
                            <Copy className="mr-2 h-4 w-4" /> Copy link
                          </Button>
                          <Button size="sm" variant="ghost" asChild>
                            <a href={shareUrl(link.token)} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="mr-2 h-4 w-4" /> Open
                            </a>
                          </Button>
                          {!link.revoked_at ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => revokeMutation.mutate(link.id)}
                              disabled={revokeMutation.isPending}
                            >
                              Turn off
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-destructive/40">
            <CardContent className="flex gap-3 p-6">
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
              <div className="space-y-1 text-sm">
                <p className="font-semibold">Anyone with the link can open it</p>
                <p className="text-muted-foreground">
                  Share links by name to a known investor, set an expiry, and turn a link off as soon
                  as it's no longer needed. Links that include bank details should only go to
                  investors you've already verified.
                </p>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
