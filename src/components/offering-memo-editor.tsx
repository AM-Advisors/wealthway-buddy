import { useEffect, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { MEMO_SECTIONS, getMemoForEdit, saveMemo } from "@/lib/offering-memo.functions";

type Draft = Record<string, string> & { headline: string };

const blank: Draft = {
  headline: "",
  overview: "",
  strategy: "",
  opportunity: "",
  terms: "",
  use_of_proceeds: "",
  team: "",
  risks: "",
};

export function OfferingMemoEditor({ offeringId }: { offeringId?: string }) {
  const load = useServerFn(getMemoForEdit);
  const save = useServerFn(saveMemo);

  const [fundId, setFundId] = useState<string | null>(offeringId ?? null);
  const [draft, setDraft] = useState<Draft>(blank);
  const [published, setPublished] = useState(false);
  const [busy, setBusy] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["offering-memo-edit", fundId],
    queryFn: () => load({ data: { offering_id: fundId } }),
  });

  const selectedId = data?.selected?.id ?? null;

  useEffect(() => {
    if (!data) return;
    const memo: any = data.memo ?? {};
    setDraft({
      headline: memo.headline ?? "",
      overview: memo.overview ?? "",
      strategy: memo.strategy ?? "",
      opportunity: memo.opportunity ?? "",
      terms: memo.terms ?? "",
      use_of_proceeds: memo.use_of_proceeds ?? "",
      team: memo.team ?? "",
      risks: memo.risks ?? "",
    });
    setPublished(Boolean(memo.is_published));
  }, [data]);

  async function submit(nextPublished?: boolean) {
    if (!selectedId) return;
    const willPublish = nextPublished ?? published;
    setBusy(true);
    try {
      await save({ data: { offering_id: selectedId, ...draft, is_published: willPublish } });
      setPublished(willPublish);
      toast.success(willPublish ? "Memo saved and visible to investors" : "Memo saved as a draft");
      await refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the memo.");
    } finally {
      setBusy(false);
    }
  }

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  const funds = data?.funds ?? [];
  if (funds.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-sm text-muted-foreground">
          You are not assigned to a fund yet, so there is no memo to write.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {!offeringId && funds.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {funds.map((fund) => (
            <Button
              key={fund.id}
              size="sm"
              variant={selectedId === fund.id ? "default" : "outline"}
              onClick={() => setFundId(fund.id)}
            >
              {fund.name}
            </Button>
          ))}
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
          <div>
            <CardTitle>{data?.selected?.name ?? "Offering memo"}</CardTitle>
            <CardDescription>
              Investors read this alongside the fund's legal documents.
              {data?.memo?.updated_at
                ? ` Last saved ${new Date(data.memo.updated_at).toLocaleString()}.`
                : ""}
            </CardDescription>
          </div>
          <Badge variant={published ? "default" : "secondary"}>
            {published ? "Visible to investors" : "Draft — only your team"}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="memo-headline">Headline</Label>
            <Input
              id="memo-headline"
              maxLength={200}
              placeholder="One line that says what this fund is"
              value={draft.headline}
              onChange={(e) => setDraft((d) => ({ ...d, headline: e.target.value }))}
            />
          </div>

          {MEMO_SECTIONS.map((section) => (
            <div key={section.key} className="space-y-2">
              <Label htmlFor={`memo-${section.key}`}>{section.label}</Label>
              <p className="text-xs text-muted-foreground">{section.hint}</p>
              <Textarea
                id={`memo-${section.key}`}
                rows={6}
                maxLength={20000}
                value={draft[section.key] ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, [section.key]: e.target.value }))}
              />
            </div>
          ))}

          <div className="flex flex-wrap items-center justify-between gap-4 border-t pt-4">
            <div className="flex items-center gap-3">
              <Switch
                id="memo-published"
                checked={published}
                onCheckedChange={(v) => setPublished(Boolean(v))}
              />
              <Label htmlFor="memo-published" className="text-sm font-normal">
                Show this memo to investors in the fund
              </Label>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" disabled={busy} onClick={() => void submit(false)}>
                Save draft
              </Button>
              <Button disabled={busy} onClick={() => void submit(true)}>
                {busy ? "Saving…" : "Save and publish"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
