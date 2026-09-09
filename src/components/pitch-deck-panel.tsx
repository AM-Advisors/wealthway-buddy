import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Maximize2,
  Presentation,
  Trash2,
  Upload,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  addPitchSlide,
  getDeckDownloadUrl,
  getPitchDeck,
  movePitchSlide,
  recordDeckView,
  removeDeckFile,
  removePitchSlide,
  savePitchDeckDetails,
  uploadDeckFile,
} from "@/lib/pitch-deck.functions";

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.readAsDataURL(file);
  });
}

function fileSize(bytes?: number | null) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function PitchDeckPanel({ offeringId }: { offeringId: string }) {
  const queryClient = useQueryClient();
  const load = useServerFn(getPitchDeck);
  const markViewed = useServerFn(recordDeckView);
  const download = useServerFn(getDeckDownloadUrl);
  const saveDetails = useServerFn(savePitchDeckDetails);
  const addSlide = useServerFn(addPitchSlide);
  const moveSlide = useServerFn(movePitchSlide);
  const dropSlide = useServerFn(removePitchSlide);
  const putDeckFile = useServerFn(uploadDeckFile);
  const clearDeckFile = useServerFn(removeDeckFile);

  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const stageRef = useRef<HTMLDivElement | null>(null);
  const viewedRef = useRef(false);

  const deckQuery = useQuery({
    queryKey: ["pitch-deck", offeringId],
    queryFn: () => load({ data: { offering_id: offeringId } }),
    retry: false,
  });

  const data = deckQuery.data;
  const slides = (data?.slides ?? []) as any[];
  const canManage = Boolean(data?.canManage);
  const total = slides.length;

  useEffect(() => {
    if (!data || viewedRef.current) return;
    viewedRef.current = true;
    void markViewed({ data: { offering_id: offeringId } }).catch(() => {});
  }, [data, markViewed, offeringId]);

  useEffect(() => {
    if (index > Math.max(0, total - 1)) setIndex(Math.max(0, total - 1));
  }, [total, index]);

  useEffect(() => {
    if (data?.deck) {
      setTitle((data.deck as any).title ?? "");
      setSummary((data.deck as any).summary ?? "");
    }
  }, [data?.deck]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "ArrowRight") setIndex((i) => Math.min(i + 1, Math.max(0, total - 1)));
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(i - 1, 0));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [total]);

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["pitch-deck", offeringId] });
  }

  const downloadMutation = useMutation({
    mutationFn: () => download({ data: { offering_id: offeringId } }),
    onSuccess: (res: any) => {
      if (res?.url) window.open(res.url, "_blank", "noopener");
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not prepare the download."),
  });

  const detailsMutation = useMutation({
    mutationFn: () =>
      saveDetails({ data: { offering_id: offeringId, title: title.trim() || "Pitch deck", summary } }),
    onSuccess: () => {
      toast.success("Deck details saved.");
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not save the deck details."),
  });

  async function onSlideFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setBusy(true);
    try {
      for (const file of files) {
        if (!file.type.startsWith("image/")) {
          toast.error(`${file.name} is not an image.`);
          continue;
        }
        if (file.size > 10 * 1024 * 1024) {
          toast.error(`${file.name} is larger than 10 MB.`);
          continue;
        }
        await addSlide({
          data: {
            offering_id: offeringId,
            file_name: file.name,
            content_type: file.type,
            content_base64: await toBase64(file),
          },
        });
      }
      toast.success(files.length > 1 ? "Slides added." : "Slide added.");
      refresh();
    } catch (err: any) {
      toast.error(err?.message ?? "Could not add that slide.");
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  async function onDeckFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) {
      toast.error("The deck file must be 25 MB or smaller.");
      e.target.value = "";
      return;
    }
    setBusy(true);
    try {
      await putDeckFile({
        data: {
          offering_id: offeringId,
          file_name: file.name,
          content_type: file.type || "application/pdf",
          content_base64: await toBase64(file),
        },
      });
      toast.success("Deck file uploaded.");
      refresh();
    } catch (err: any) {
      toast.error(err?.message ?? "Could not upload that file.");
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  if (deckQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading the pitch deck…</p>;
  }
  if (deckQuery.error) {
    return <p className="text-sm text-muted-foreground">{(deckQuery.error as any)?.message}</p>;
  }

  const current = slides[index];
  const deck = data?.deck as any;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Presentation className="h-5 w-5 text-primary" aria-hidden />
              {deck?.title || "Pitch deck"}
            </CardTitle>
            <CardDescription>
              {deck?.summary ||
                (total > 0
                  ? `${total} slide${total === 1 ? "" : "s"}. Use the arrows or your keyboard to move through the deck.`
                  : "No slides yet.")}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {total > 0 ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => stageRef.current?.requestFullscreen?.()}
              >
                <Maximize2 className="mr-2 h-4 w-4" aria-hidden />
                Full screen
              </Button>
            ) : null}
            {data?.hasDownload ? (
              <Button size="sm" onClick={() => downloadMutation.mutate()} disabled={downloadMutation.isPending}>
                <Download className="mr-2 h-4 w-4" aria-hidden />
                {downloadMutation.isPending ? "Preparing…" : "Download deck"}
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {total === 0 ? (
            <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              {canManage
                ? "Add slide images below to build the deck investors will see here."
                : "The fund has not published a deck yet. You will see it here as soon as it is added."}
            </p>
          ) : (
            <>
              <div
                ref={stageRef}
                className="relative flex items-center justify-center overflow-hidden rounded-lg bg-foreground/95"
                style={{ aspectRatio: "16 / 9" }}
              >
                {current?.image_url ? (
                  <img
                    src={current.image_url}
                    alt={current.heading || `Slide ${index + 1} of ${total}`}
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <p className="p-6 text-sm text-background">This slide could not be loaded.</p>
                )}
                <button
                  type="button"
                  aria-label="Previous slide"
                  onClick={() => setIndex((i) => Math.max(0, i - 1))}
                  disabled={index === 0}
                  className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-background/85 p-2 shadow disabled:opacity-30"
                >
                  <ChevronLeft className="h-5 w-5" aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label="Next slide"
                  onClick={() => setIndex((i) => Math.min(total - 1, i + 1))}
                  disabled={index >= total - 1}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-background/85 p-2 shadow disabled:opacity-30"
                >
                  <ChevronRight className="h-5 w-5" aria-hidden />
                </button>
                <span className="absolute bottom-3 right-3 rounded-full bg-background/85 px-3 py-1 text-xs font-medium">
                  {index + 1} / {total}
                </span>
              </div>

              {(current?.heading || current?.caption) && (
                <div className="space-y-1">
                  {current?.heading ? <p className="font-medium">{current.heading}</p> : null}
                  {current?.caption ? (
                    <p className="text-sm text-muted-foreground">{current.caption}</p>
                  ) : null}
                </div>
              )}

              <div className="flex gap-2 overflow-x-auto pb-1">
                {slides.map((slide, i) => (
                  <button
                    key={slide.id}
                    type="button"
                    onClick={() => setIndex(i)}
                    aria-label={`Go to slide ${i + 1}`}
                    className={`relative h-16 w-28 shrink-0 overflow-hidden rounded border ${
                      i === index ? "border-primary ring-2 ring-primary/40" : "border-border"
                    }`}
                  >
                    {slide.image_url ? (
                      <img src={slide.image_url} alt="" className="h-full w-full object-cover" />
                    ) : null}
                    <span className="absolute bottom-0 right-0 bg-background/85 px-1 text-[11px]">{i + 1}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {data?.hasDownload ? (
            <p className="text-xs text-muted-foreground">
              Download: {deck?.file_name} {fileSize(deck?.file_size_bytes) ? `· ${fileSize(deck?.file_size_bytes)}` : ""}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Manage the deck</CardTitle>
            <CardDescription>
              Slides are images (PNG or JPG), shown in order. The deck file is what investors download.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="deck-title">Deck title</Label>
                <Input
                  id="deck-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Pitch deck"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="deck-summary">Short summary</Label>
                <Textarea
                  id="deck-summary"
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  rows={2}
                  placeholder="What investors should take away from this deck."
                />
              </div>
            </div>
            <Button size="sm" onClick={() => detailsMutation.mutate()} disabled={detailsMutation.isPending}>
              {detailsMutation.isPending ? "Saving…" : "Save details"}
            </Button>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 rounded-md border p-4">
                <Label htmlFor="slide-files" className="flex items-center gap-2">
                  <Upload className="h-4 w-4" aria-hidden />
                  Add slide images
                </Label>
                <Input
                  id="slide-files"
                  type="file"
                  accept="image/*"
                  multiple
                  disabled={busy}
                  onChange={onSlideFiles}
                />
                <p className="text-xs text-muted-foreground">
                  Up to 10 MB each. Select several at once — they are added in the order you pick them.
                </p>
              </div>
              <div className="space-y-2 rounded-md border p-4">
                <Label htmlFor="deck-file" className="flex items-center gap-2">
                  <Download className="h-4 w-4" aria-hidden />
                  Downloadable deck file
                </Label>
                <Input id="deck-file" type="file" disabled={busy} onChange={onDeckFile} />
                <p className="text-xs text-muted-foreground">PDF or PowerPoint, up to 25 MB.</p>
                {data?.hasDownload ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      try {
                        await clearDeckFile({ data: { offering_id: offeringId } });
                        toast.success("Deck file removed.");
                        refresh();
                      } catch (err: any) {
                        toast.error(err?.message ?? "Could not remove the file.");
                      }
                    }}
                  >
                    Remove current file
                  </Button>
                ) : null}
              </div>
            </div>

            {total > 0 ? (
              <div className="space-y-2">
                <p className="text-sm font-medium">Slide order</p>
                <ul className="divide-y rounded-md border">
                  {slides.map((slide, i) => (
                    <li key={slide.id} className="flex items-center gap-3 p-3">
                      <Badge variant="secondary">{i + 1}</Badge>
                      {slide.image_url ? (
                        <img src={slide.image_url} alt="" className="h-10 w-16 rounded object-cover" />
                      ) : null}
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {slide.heading || slide.image_name || `Slide ${i + 1}`}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={i === 0}
                        onClick={async () => {
                          await moveSlide({ data: { id: slide.id, direction: "up" } });
                          refresh();
                        }}
                      >
                        Up
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={i === total - 1}
                        onClick={async () => {
                          await moveSlide({ data: { id: slide.id, direction: "down" } });
                          refresh();
                        }}
                      >
                        Down
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={async () => {
                          await dropSlide({ data: { id: slide.id } });
                          toast.success("Slide removed.");
                          refresh();
                        }}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                        <span className="sr-only">Remove slide</span>
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
