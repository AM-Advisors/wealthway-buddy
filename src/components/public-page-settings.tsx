import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { getPublicPageSettings, savePublicPageSettings } from "@/lib/public-fund.functions";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

/** Turn a fund's public page on or off and edit what visitors read first. */
export function PublicPageSettings({ offeringId }: { offeringId: string }) {
  const load = useServerFn(getPublicPageSettings);
  const save = useServerFn(savePublicPageSettings);
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["public-page-settings", offeringId],
    queryFn: () => load({ data: { offering_id: offeringId } }),
  });

  const [enabled, setEnabled] = useState(false);
  const [headline, setHeadline] = useState("");
  const [summary, setSummary] = useState("");

  useEffect(() => {
    if (!query.data) return;
    setEnabled(query.data.enabled);
    setHeadline(query.data.headline);
    setSummary(query.data.summary);
  }, [query.data]);

  const mutation = useMutation({
    mutationFn: () =>
      save({ data: { offering_id: offeringId, enabled, headline, summary } }),
    onSuccess: () => {
      toast.success("Public page updated");
      void queryClient.invalidateQueries({ queryKey: ["public-page-settings", offeringId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const path = query.data?.public_path ?? "";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Public fund page</CardTitle>
        <CardDescription>
          A page anyone with the link can read: pitch deck, document list and cap table, with a
          button to request access.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
          <div>
            <p className="font-medium">Show this fund publicly</p>
            <p className="text-xs text-muted-foreground">
              {enabled ? `Live at ${path}` : "Off — nobody outside your team can see the page."}
            </p>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>

        <div className="space-y-1">
          <Label htmlFor={`pp-headline-${offeringId}`}>Headline</Label>
          <Input
            id={`pp-headline-${offeringId}`}
            value={headline}
            placeholder={query.data?.name ?? "Fund name"}
            onChange={(e) => setHeadline(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`pp-summary-${offeringId}`}>What visitors read first</Label>
          <Textarea
            id={`pp-summary-${offeringId}`}
            rows={4}
            value={summary}
            placeholder="A short description of the strategy and who this fund is for."
            onChange={(e) => setSummary(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button disabled={mutation.isPending} onClick={() => mutation.mutate()}>
            Save
          </Button>
          {enabled && path ? (
            <Button asChild variant="outline">
              <a href={path} target="_blank" rel="noreferrer">
                View public page
              </a>
            </Button>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">
          The cap table on the public page shows investor names, amounts and ownership. Offering
          documents are listed by name only and open after you invite someone.
        </p>
      </CardContent>
    </Card>
  );
}
