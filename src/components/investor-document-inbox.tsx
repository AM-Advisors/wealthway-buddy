import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { myDocumentInboxFn } from "@/lib/offering-document-send.functions";

/** Documents shared with the signed-in investor, grouped by investment. */
export function InvestorDocumentInbox() {
  const fetchInbox = useServerFn(myDocumentInboxFn);
  const q = useQuery({ queryKey: ["investor-document-inbox"], queryFn: () => fetchInbox() });
  const groups = (q.data ?? []).filter((g) => g.documents.length);
  if (q.isLoading || !groups.length) return null;
  return (
    <Card className="mb-8">
      <CardHeader>
        <CardTitle>Documents from your funds</CardTitle>
        <CardDescription>Subscription agreements, operating agreements and offering documents shared with you.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {groups.map((g) => (
          <div key={g.onboardingId}>
            <div className="mb-2 flex items-center justify-between">
              <p className="font-medium">{g.fundName}</p>
              <Button asChild size="sm" variant="outline">
                <Link to="/investment/$onboardingId" params={{ onboardingId: g.onboardingId }}>Open investment</Link>
              </Button>
            </div>
            <ul className="divide-y rounded-md border">
              {g.documents.map((d: any) => (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                  <span>
                    <span className="font-medium">{d.title}</span>
                    <span className="block text-muted-foreground">
                      {[d.versionLabel, d.sentAt ? `Sent ${new Date(d.sentAt).toLocaleDateString()}` : null].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <Badge variant={d.action === "Completed" ? "secondary" : "default"}>{d.action}</Badge>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
