import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buildCertificateHtml, certificateFileName } from "@/components/certificate-document";

function downloadHtml(name: string, html: string) {
  const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

const num = (v: number) => Number(v ?? 0).toLocaleString("en-US", { maximumFractionDigits: 4 });

/** Read-only view of one shareholder's position and certificates. */
export function HolderSharesView({ position }: { position: any }) {
  const holdings = (position?.holdings ?? []) as any[];
  const certificates = (position?.certificates ?? []) as any[];
  const outstanding = holdings
    .filter((h) => h.status === "outstanding")
    .reduce((sum, h) => sum + Number(h.quantity ?? 0), 0);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{position?.companyName}</CardTitle>
          <CardDescription>
            {position?.holderName} · {num(outstanding)} units held
          </CardDescription>
        </CardHeader>
        <CardContent>
          {holdings.length === 0 ? (
            <p className="text-sm text-muted-foreground">No shares are recorded for you yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Security</th>
                    <th className="py-2 pr-3 font-medium">Units</th>
                    <th className="py-2 pr-3 font-medium">Issued</th>
                    <th className="py-2 pr-3 font-medium">Certificate</th>
                    <th className="py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {holdings.map((h) => (
                    <tr key={h.id} className="border-b last:border-0">
                      <td className="py-2 pr-3">{h.share_class || h.security_type}</td>
                      <td className="py-2 pr-3">{num(h.quantity)}</td>
                      <td className="py-2 pr-3">{h.issued_on ?? "—"}</td>
                      <td className="py-2 pr-3">{h.certificate_no ?? "—"}</td>
                      <td className="py-2">{h.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your certificates</CardTitle>
          <CardDescription>Download a copy at any time.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {certificates.length === 0 ? (
            <p className="text-sm text-muted-foreground">No certificates yet.</p>
          ) : (
            certificates.map((c) => (
              <div
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
              >
                <div>
                  <p className="font-medium">{c.certificate_no}</p>
                  <p className="text-sm text-muted-foreground">
                    {num(c.snapshot?.quantity)} {c.snapshot?.shareClass || c.snapshot?.securityType}
                    {c.signed_at ? ` · signed ${new Date(c.signed_at).toLocaleDateString()}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={c.status === "issued" ? "default" : "outline"}>{c.status}</Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => downloadHtml(certificateFileName(c), buildCertificateHtml(c))}
                  >
                    Download
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
