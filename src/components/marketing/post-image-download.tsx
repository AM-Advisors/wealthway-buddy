import { useEffect, useState } from "react";
import { Download, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type PreparedImage = { url: string; blob: Blob };

export function PostImageDownload({ url, index }: { url: string; index: number }) {
  const [prepared, setPrepared] = useState<PreparedImage | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // Prepare before the click so mobile browsers retain download/share activation.
  useEffect(() => {
    const controller = new AbortController();
    setPrepared(null);
    setFailed(false);
    if (!url) return () => controller.abort();
    void fetch(url, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Image unavailable");
        const blob = await response.blob();
        if (!blob.size || !blob.type.startsWith("image/")) throw new Error("Image unavailable");
        if (!controller.signal.aborted) setPrepared({ url, blob });
      })
      .catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [url, attempt]);

  const ready = prepared?.url === url ? prepared : null;
  const download = async () => {
    if (!ready) return;
    const extension = ({ "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif", "image/svg+xml": "svg" } as Record<string, string>)[ready.blob.type]
      ?? "img";
    const filename = `harmonious-post-image-${index + 1}.${extension}`;
    const file = new File([ready.blob], filename, { type: ready.blob.type });
    if (matchMedia("(pointer: coarse)").matches && navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: filename }); return; }
      catch (error) { if (error instanceof DOMException && error.name === "AbortError") return; }
    }
    try {
      const objectUrl = URL.createObjectURL(ready.blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
    } catch { toast.error("Could not download the image. Please try again."); }
  };

  return <Button type="button" size="sm" variant="outline" className="mt-2 w-full" disabled={!url || (!ready && !failed)}
    title={failed ? "Retry image download" : `Download image ${index + 1}`}
    aria-label={failed ? `Retry download image ${index + 1}` : `Download image ${index + 1}`}
    onClick={() => failed ? setAttempt((value) => value + 1) : void download()}>
    {failed ? <RefreshCw className="h-4 w-4 shrink-0" /> : ready ? <Download className="h-4 w-4 shrink-0" /> : <Loader2 className="h-4 w-4 shrink-0 animate-spin" />}
    <span className="hidden sm:inline">{failed ? "Retry" : "Download"}</span>
  </Button>;
}