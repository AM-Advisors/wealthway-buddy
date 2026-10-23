import { Link, createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getClassroomArticle, newClassroomImage, publishClassroomArticle, refreshClassroomArticle, saveClassroomEdit } from "@/lib/classroom.functions";
import { sanitizeHtml } from "@/lib/classroom-html";
import { RESOURCE_CATEGORIES } from "@/lib/marketing/site-config";

export const Route = createFileRoute("/_authenticated/marketing_/classroom_/$id")({
  head: () => ({ meta: [
    { title: "Edit Classroom article - Harmonious Marketing" },
    { name: "description", content: "Edit, refresh with AI and publish a Harmonious Classroom article." },
    { property: "og:title", content: "Edit Classroom article - Harmonious Marketing" },
    { property: "og:description", content: "Classroom article editor with version history." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex" },
  ] }),
  component: Editor,
});

const STATUS: Record<string, string> = { draft: "Draft", published: "Published", unpublished: "Unpublished" };
const SOURCE: Record<string, string> = { import: "Imported from Wix", ai_refresh: "AI refresh", ai_new: "AI new article", edit: "Edit" };
const ACTION: Record<string, string> = { imported: "Imported", edited: "Edited", published: "Published", unpublished: "Unpublished", ai_refresh: "AI refresh", ai_new: "AI wrote draft", new_image: "New AI image" };

function Editor() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const get = useServerFn(getClassroomArticle), save = useServerFn(saveClassroomEdit), publish = useServerFn(publishClassroomArticle);
  const refresh = useServerFn(refreshClassroomArticle), image = useServerFn(newClassroomImage);
  const q = useQuery({ queryKey: ["classroom-article", id], queryFn: () => get({ data: { id } }) });
  const [f, setF] = useState<any>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [guidance, setGuidance] = useState("");
  const [theme, setTheme] = useState("");

  const a: any = q.data?.article;
  const current: any = q.data?.versions.find((v: any) => v.id === a?.current_version_id);
  useEffect(() => {
    if (current) setF({ title: current.title, contentHtml: current.content_html, heroImageUrl: current.hero_image_url, heroImageAlt: current.hero_image_alt, metaTitle: current.meta_title, metaDescription: current.meta_description, category: a.category });
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key);
    try { await fn(); toast.success(ok); await Promise.all([qc.invalidateQueries({ queryKey: ["classroom-article", id] }), qc.invalidateQueries({ queryKey: ["classroom-admin"] })]); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Something went wrong."); }
    finally { setBusy(null); }
  };

  if (q.isLoading || !f) return <p className="p-6 text-sm text-muted-foreground">{q.error ? (q.error as Error).message : "Loading…"}</p>;
  const dirty = f.title !== current.title || f.contentHtml !== current.content_html || f.heroImageUrl !== current.hero_image_url || f.heroImageAlt !== current.hero_image_alt || f.metaTitle !== current.meta_title || f.metaDescription !== current.meta_description || f.category !== a.category;
  const liveIsCurrent = a.status === "published" && a.published_version_id === a.current_version_id;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <Link to="/marketing/classroom" className="text-sm text-muted-foreground hover:underline">← Classroom</Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={a.status === "published" ? "default" : "secondary"}>{STATUS[a.status]}</Badge>
            {a.status === "published" && !liveIsCurrent && <Badge variant="outline">Newer draft not yet live</Badge>}
            <span className="text-xs text-muted-foreground">/post/{a.slug} · editing v{current.version}</span>
          </div>
          <h1 className="mt-2 font-heading text-2xl font-semibold">{current.title}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {a.status === "published" && (
            <>
              <Button variant="outline" asChild><a href={`/post/${a.slug}`} target="_blank" rel="noreferrer">View live</a></Button>
              <Button variant="outline" disabled={!!busy} onClick={() => run("unpub", () => publish({ data: { id, publish: false } }), "Article taken offline.")}>Unpublish</Button>
            </>
          )}
          <Button disabled={!!busy || dirty || liveIsCurrent} onClick={() => run("pub", () => publish({ data: { id, publish: true } }), "Article is live.")}>
            {liveIsCurrent ? "Live" : a.status === "published" ? "Publish this version" : "Publish"}
          </Button>
        </div>
      </div>
      {dirty && <p className="text-sm text-warning">You have unsaved changes. Save them as a new version before publishing.</p>}

      <Tabs defaultValue="edit">
        <TabsList>
          <TabsTrigger value="edit">Edit</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
          <TabsTrigger value="ai">AI new version</TabsTrigger>
          <TabsTrigger value="history">History ({q.data!.versions.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="edit" className="space-y-4">
          <label className="block space-y-1 text-sm">Title<Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
          <label className="block space-y-1 text-sm">Category
            <Select value={f.category} onValueChange={(v) => setF({ ...f, category: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{RESOURCE_CATEGORIES.map((c) => <SelectItem key={c.slug} value={c.slug}>{c.label}</SelectItem>)}</SelectContent>
            </Select>
          </label>
          <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
            {f.heroImageUrl ? <img src={f.heroImageUrl} alt={f.heroImageAlt ?? ""} className="aspect-video w-full rounded-md object-cover" /> : <div className="aspect-video rounded-md bg-muted" />}
            <div className="space-y-2">
              <Input placeholder="Main image address (https://…)" value={f.heroImageUrl ?? ""} onChange={(e) => setF({ ...f, heroImageUrl: e.target.value || null })} />
              <Input placeholder="Image description for screen readers" value={f.heroImageAlt ?? ""} onChange={(e) => setF({ ...f, heroImageAlt: e.target.value || null })} />
            </div>
          </div>
          <label className="block space-y-1 text-sm">Article text (HTML)<Textarea rows={18} className="font-mono text-xs" value={f.contentHtml} onChange={(e) => setF({ ...f, contentHtml: e.target.value })} /></label>
          <label className="block space-y-1 text-sm">Search title<Input value={f.metaTitle ?? ""} onChange={(e) => setF({ ...f, metaTitle: e.target.value || null })} /></label>
          <label className="block space-y-1 text-sm">Search description<Textarea rows={2} value={f.metaDescription ?? ""} onChange={(e) => setF({ ...f, metaDescription: e.target.value || null })} /></label>
          <Button disabled={!dirty || !!busy} onClick={() => run("save", () => save({ data: { id, ...f } }), "Saved as a new version.")}>Save as new version</Button>
        </TabsContent>

        <TabsContent value="preview">
          <article className="mx-auto max-w-3xl">
            <h1 className="text-3xl">{f.title}</h1>
            {f.heroImageUrl && <img src={f.heroImageUrl} alt={f.heroImageAlt ?? ""} className="mt-6 w-full rounded-xl" />}
            <div className="prose prose-neutral mt-6 max-w-none dark:prose-invert" dangerouslySetInnerHTML={{ __html: sanitizeHtml(f.contentHtml) }} />
          </article>
        </TabsContent>

        <TabsContent value="ai" className="space-y-6">
          <div className="space-y-2 rounded-lg border p-4">
            <h2 className="font-medium">Refresh this article</h2>
            <p className="text-sm text-muted-foreground">AI rewrites the current version and adds a new branded image. It's saved as a new draft version; the live article doesn't change until you publish.</p>
            <Textarea placeholder="Guidance (optional), e.g. shorter, add a checklist, focus on first-time managers" value={guidance} onChange={(e) => setGuidance(e.target.value)} />
            <div className="flex flex-wrap gap-2">
              <Button disabled={!!busy || dirty} onClick={() => run("refresh", () => refresh({ data: { id, guidance: guidance || null, withImage: true } }), "New version written.")}>{busy === "refresh" ? "Writing… (about a minute)" : "Generate new version with image"}</Button>
              <Button variant="outline" disabled={!!busy || dirty} onClick={() => run("refresh2", () => refresh({ data: { id, guidance: guidance || null, withImage: false } }), "New version written.")}>Text only</Button>
            </div>
          </div>
          <div className="space-y-2 rounded-lg border p-4">
            <h2 className="font-medium">New image only</h2>
            <Input placeholder="Image theme (optional)" value={theme} onChange={(e) => setTheme(e.target.value)} />
            <Button variant="outline" disabled={!!busy || dirty} onClick={() => run("img", () => image({ data: { id, theme } }), "New image added as a new version.")}>{busy === "img" ? "Creating…" : "Generate image"}</Button>
          </div>
        </TabsContent>

        <TabsContent value="history" className="grid gap-6 lg:grid-cols-2">
          <div>
            <h2 className="mb-2 font-medium">Versions</h2>
            <ul className="space-y-2">
              {q.data!.versions.map((v: any) => (
                <li key={v.id} className="flex items-center justify-between gap-2 rounded-md border p-3 text-sm">
                  <div>
                    <p className="font-medium">v{v.version} · {SOURCE[v.source]}{v.id === a.published_version_id && a.status === "published" ? " · Live" : ""}</p>
                    <p className="text-xs text-muted-foreground">{v.title} · {v.created_by_name} · {new Date(v.created_at).toLocaleString()}</p>
                  </div>
                  {v.id !== a.published_version_id && (
                    <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run("pv", () => publish({ data: { id, publish: true, versionId: v.id } }), `v${v.version} is live.`)}>Publish this</Button>
                  )}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="mb-2 font-medium">Activity</h2>
            <ul className="space-y-1 text-sm">
              {q.data!.events.map((e: any) => (
                <li key={e.id} className="text-muted-foreground">{new Date(e.created_at).toLocaleString()} · {ACTION[e.action] ?? e.action}{e.actor_name ? ` by ${e.actor_name}` : ""}</li>
              ))}
            </ul>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
