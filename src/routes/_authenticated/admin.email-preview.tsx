import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { getAdminAccess } from "@/lib/admin.functions";
import { listEmailTemplates, renderEmailPreview } from "@/lib/email-preview.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/admin/email-preview")({
  head: () => ({
    meta: [
      { title: "Email Preview — Harmonious Admin" },
      {
        name: "description",
        content:
          "Preview Harmonious investor emails exactly as they render in an inbox, with editable sample content.",
      },
      { property: "og:title", content: "Email Preview — Harmonious Admin" },
      {
        property: "og:description",
        content: "See how branded onboarding emails look to investors before sending.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EmailPreviewPage,
});

const WIDTHS = [
  { key: "desktop", label: "Desktop", px: 720 },
  { key: "mobile", label: "Mobile", px: 390 },
] as const;

function EmailPreviewPage() {
  const access = useServerFn(getAdminAccess);
  const listFn = useServerFn(listEmailTemplates);
  const renderFn = useServerFn(renderEmailPreview);

  const accessQuery = useQuery({ queryKey: ["admin-access"], queryFn: () => access() });
  const isAdmin = accessQuery.data?.isAdmin;

  const templatesQuery = useQuery({
    queryKey: ["email-templates"],
    queryFn: () => listFn(),
    enabled: isAdmin === true,
  });

  const templates = templatesQuery.data?.templates ?? [];
  const [selected, setSelected] = useState<string>("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [width, setWidth] = useState<(typeof WIDTHS)[number]["key"]>("desktop");

  useEffect(() => {
    if (!selected && templates.length > 0) {
      const first = templates[0]!;
      setSelected(first.name);
      setFields({ ...first.previewData });
    }
  }, [templates, selected]);

  const previewQuery = useQuery({
    queryKey: ["email-preview", selected, fields],
    queryFn: () => renderFn({ data: { templateName: selected, data: fields } }),
    enabled: isAdmin === true && Boolean(selected),
  });

  if (accessQuery.isLoading) {
    return <main className="mx-auto max-w-5xl px-4 py-10 text-sm text-muted-foreground">Loading…</main>;
  }

  if (!isAdmin) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16">
        <h1 className="text-3xl">Restricted</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Email previews are limited to Harmonious staff.
        </p>
        <Button asChild variant="outline" className="mt-6">
          <Link to="/dashboard">Back to your application</Link>
        </Button>
      </main>
    );
  }

  const frameWidth = WIDTHS.find((w) => w.key === width)?.px ?? 720;

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl">Email preview</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Exactly what an investor sees in their inbox. Nothing is sent from this page.
          </p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link to="/admin">Back to queue</Link>
        </Button>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[320px_1fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Design</CardTitle>
              <CardDescription>Choose which email to look at.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {templatesQuery.isLoading && (
                <p className="text-sm text-muted-foreground">Loading designs…</p>
              )}
              {templates.map((t) => (
                <Button
                  key={t.name}
                  size="sm"
                  className="w-full justify-start"
                  variant={selected === t.name ? "default" : "outline"}
                  onClick={() => {
                    setSelected(t.name);
                    setFields({ ...t.previewData });
                  }}
                >
                  {t.displayName}
                </Button>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Sample content</CardTitle>
              <CardDescription>Edit the wording to see how it looks.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {Object.keys(fields).length === 0 && (
                <p className="text-sm text-muted-foreground">This design has no editable fields.</p>
              )}
              {Object.entries(fields).map(([key, value]) => (
                <div key={key} className="space-y-1.5">
                  <Label htmlFor={`field-${key}`} className="capitalize">
                    {key.replace(/([A-Z])/g, " $1").replace(/_/g, " ")}
                  </Label>
                  {key === "body" ? (
                    <Textarea
                      id={`field-${key}`}
                      rows={6}
                      value={value}
                      onChange={(e) => setFields((f) => ({ ...f, [key]: e.target.value }))}
                    />
                  ) : (
                    <Input
                      id={`field-${key}`}
                      value={value}
                      onChange={(e) => setFields((f) => ({ ...f, [key]: e.target.value }))}
                    />
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {WIDTHS.map((w) => (
              <Button
                key={w.key}
                size="sm"
                variant={width === w.key ? "default" : "outline"}
                onClick={() => setWidth(w.key)}
              >
                {w.label}
              </Button>
            ))}
          </div>

          <Card>
            <CardHeader className="border-b">
              <CardDescription>Subject line</CardDescription>
              <CardTitle className="text-base">
                {previewQuery.data?.subject ?? (previewQuery.isLoading ? "Rendering…" : "—")}
              </CardTitle>
            </CardHeader>
            <CardContent className="bg-muted/40 p-4">
              {previewQuery.isError && (
                <p className="py-10 text-center text-sm text-destructive">
                  This design could not be rendered.
                </p>
              )}
              {previewQuery.data?.html && (
                <div className="mx-auto overflow-hidden rounded-md border bg-white" style={{ maxWidth: frameWidth }}>
                  <iframe
                    title="Email preview"
                    srcDoc={previewQuery.data.html}
                    sandbox=""
                    className="h-[760px] w-full border-0"
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
