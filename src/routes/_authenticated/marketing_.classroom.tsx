import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { importClassroomBatch, listClassroom, newClassroomArticle } from "@/lib/classroom.functions";
import { RESOURCE_CATEGORIES } from "@/lib/marketing/site-config";

export const Route = createFileRoute("/_authenticated/marketing_/classroom")({
  head: () => ({ meta: [
    { title: "Classroom - Harmonious Marketing" },
    { name: "description", content: "Import, edit, refresh with AI and publish Harmonious Classroom articles." },
    { property: "og:title", content: "Classroom - Harmonious Marketing" },
    { property: "og:description", content: "Manage and publish Harmonious Classroom articles." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex" },
  ] }),
  component: ClassroomAdmin,
});

export const STATUS_LABEL: Record<string, string> = { draft: "Draft", published: "Published", unpublished: "Unpublished" };
const catLabel = (s: string) => RESOURCE_CATEGORIES.find((c) => c.slug === s)?.label ?? s;

function ClassroomAdmin() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const list = useServerFn(listClassroom), importBatch = useServerFn(importClassroomBatch), create = useServerFn(newClassroomArticle);
  const q = useQuery({ queryKey: ["classroom-admin"], queryFn: () => list() });
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [progress, setProgress] = useState<{ done: number; total: number; failed: { slug: string; message: string }[] } | null>(null);
  const [openNew, setOpenNew] = useState(false);
  const [form, setForm] = useState({ topic: "", audience: "", points: "", category: "fund-administration", slug: "" });
  const [busy, setBusy] = useState(false);

  const runImport = async () => {
    const todo = q.data?.notImported ?? [];
    if (!todo.length) return;
    const failed: { slug: string; message: string }[] = [];
    setProgress({ done: 0, total: todo.length, failed });
    for (let i = 0; i < todo.length; i += 5) {
      try {
        const r = await importBatch({ data: { slugs: todo.slice(i, i + 5) } });
        r.results.filter((x) => !x.ok).forEach((x) => failed.push({ slug: x.slug, message: x.message }));
      } catch (e) {
        todo.slice(i, i + 5).forEach((slug) => failed.push({ slug, message: e instanceof Error ? e.message : "Failed" }));
      }
      setProgress({ done: Math.min(i + 5, todo.length), total: todo.length, failed: [...failed] });
      await qc.invalidateQueries({ queryKey: ["classroom-admin"] });
    }
    toast[failed.length ? "warning" : "success"](failed.length ? `Import finished; ${failed.length} need another try.` : "All articles imported as drafts.");
  };

  const submitNew = async () => {
    setBusy(true);
    try {
      const r = await create({ data: { ...form, audience: form.audience || null, points: form.points || null } });
      toast.success("Draft article written.");
      setOpenNew(false);
      await qc.invalidateQueries({ queryKey: ["classroom-admin"] });
      nav({ to: "/marketing/classroom/$id", params: { id: r.id } });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't write the article."); }
    finally { setBusy(false); }
  };

  const rows = (q.data?.articles ?? []).filter((a: any) => (filter === "all" || a.status === filter) && (!search || a.title.toLowerCase().includes(search.toLowerCase())));
  const counts = (s: string) => (q.data?.articles ?? []).filter((a: any) => a.status === s).length;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Harmonious Classroom</h1>
          <p className="text-sm text-muted-foreground">Bring articles over from www.harmonious.co, refresh them with AI, write new ones and publish.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setOpenNew(true)}>Write new article with AI</Button>
          <Button onClick={runImport} disabled={!q.data?.notImported.length || !!(progress && progress.done < progress.total)}>
            {q.data?.notImported.length ? `Import ${q.data.notImported.length} articles from Wix` : "All Wix articles imported"}
          </Button>
        </div>
      </div>

      {progress && (
        <div className="space-y-2 rounded-lg border p-4">
          <p className="text-sm">Imported {progress.done} of {progress.total}</p>
          <Progress value={(progress.done / progress.total) * 100} />
          {progress.failed.length > 0 && (
            <ul className="text-xs text-destructive">{progress.failed.map((f) => <li key={f.slug}>/post/{f.slug}: {f.message}</li>)}</ul>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {["all", "draft", "published", "unpublished"].map((s) => (
          <Button key={s} size="sm" variant={filter === s ? "default" : "outline"} onClick={() => setFilter(s)}>
            {s === "all" ? `All (${q.data?.articles.length ?? 0})` : `${STATUS_LABEL[s]} (${counts(s)})`}
          </Button>
        ))}
        <Input className="ml-auto max-w-xs" placeholder="Search titles" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {q.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : q.error ? <p className="text-sm text-destructive">{(q.error as Error).message}</p> : rows.length === 0 ? (
        <p className="rounded-lg border p-8 text-center text-sm text-muted-foreground">No articles yet. Import them from Wix or write a new one.</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((a: any) => (
            <li key={a.id} className="overflow-hidden rounded-xl border bg-card">
              <Link to="/marketing/classroom/$id" params={{ id: a.id }} className="block hover:bg-muted/40">
                {a.hero_image_url ? <img src={a.hero_image_url} alt="" className="aspect-video w-full object-cover" loading="lazy" /> : <div className="aspect-video w-full bg-muted" />}
                <div className="space-y-2 p-4">
                  <div className="flex flex-wrap gap-1">
                    <Badge variant={a.status === "published" ? "default" : "secondary"}>{STATUS_LABEL[a.status]}</Badge>
                    {a.has_unpublished_changes && <Badge variant="outline">Unpublished changes</Badge>}
                    <Badge variant="outline">{catLabel(a.category)}</Badge>
                  </div>
                  <p className="font-medium leading-snug">{a.title}</p>
                  <p className="text-xs text-muted-foreground">/post/{a.slug} · v{a.version}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={openNew} onOpenChange={setOpenNew}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Write a new article with AI</DialogTitle>
            <DialogDescription>AI writes a draft with a branded image. Nothing goes live until you publish it.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Topic, e.g. How SPV closings work" value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value, slug: form.slug || "" })} />
            <Input placeholder="Audience (optional)" value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })} />
            <Textarea placeholder="Key points to cover (optional)" value={form.points} onChange={(e) => setForm({ ...form, points: e.target.value })} />
            <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{RESOURCE_CATEGORIES.map((c) => <SelectItem key={c.slug} value={c.slug}>{c.label}</SelectItem>)}</SelectContent>
            </Select>
            <div>
              <Input placeholder="web-address-for-this-article" value={form.slug}
                onFocus={() => !form.slug && form.topic && setForm({ ...form, slug: form.topic.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) })}
                onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })} />
              <p className="mt-1 text-xs text-muted-foreground">Opens at /post/{form.slug || "…"}. This can't be changed later.</p>
            </div>
            <Button className="w-full" disabled={busy || form.topic.trim().length < 5 || form.slug.length < 3} onClick={submitNew}>
              {busy ? "Writing… (about a minute)" : "Write draft"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
