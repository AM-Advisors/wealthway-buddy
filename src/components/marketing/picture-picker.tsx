/** One picture source chooser for every marketing editor: upload, Library, or AI-created in brand colors. Returns a stored image address. */
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ImagePlus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MarketingDrivePicker } from "@/components/marketing-drive-picker";
import { fileToBase64 } from "@/components/marketing-ui";
import { useMarketingDriveImage } from "@/lib/marketing-drive.functions";
import { marketingBackgroundArt, uploadMarketingAsset } from "@/lib/marketing.functions";

export function MarketingPicturePicker({ theme, onPick, disabled, compact }: { theme: string; onPick: (p: { url: string; alt: string }) => void; disabled?: boolean; compact?: boolean }) {
  const upload = useServerFn(uploadMarketingAsset);
  const fromLibrary = useServerFn(useMarketingDriveImage);
  const art = useServerFn(marketingBackgroundArt);
  const [busy, setBusy] = useState<"" | "up" | "lib" | "ai">("");
  const [idea, setIdea] = useState("");
  const run = async (k: typeof busy, f: () => Promise<void>) => { setBusy(k); try { await f(); } catch (e) { toast.error((e as Error).message); } finally { setBusy(""); } };
  const off = disabled || !!busy;
  const prompt = (idea.trim() || theme).trim().slice(0, 1900);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button asChild size="sm" variant="outline" disabled={off}>
        <label className={off ? "pointer-events-none opacity-50" : "cursor-pointer"}>
          <ImagePlus className="mr-1 h-4 w-4" />{busy === "up" ? "Uploading…" : "Upload picture"}
          <input type="file" className="sr-only" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(e) => {
            const f = e.target.files?.[0]; e.target.value = "";
            if (f) run("up", async () => { const r = await upload({ data: { fileName: f.name, contentType: f.type, base64: await fileToBase64(f) } }); onPick({ url: r.url, alt: "" }); });
          }} />
        </label>
      </Button>
      <MarketingDrivePicker kind="image" label="From Library" disabled={off} onPick={(a) => run("lib", async () => { const r = await fromLibrary({ data: { assetId: a.id } }); onPick({ url: r.url, alt: a.name }); })} />
      {!compact && <Input className="h-9 w-56" value={idea} maxLength={300} placeholder="Describe the picture (optional)" onChange={(e) => setIdea(e.target.value)} />}
      <Button size="sm" variant="outline" disabled={off || prompt.length < 3} onClick={() => run("ai", async () => {
        const { dataUrl } = await art({ data: { theme: prompt, kind: "picture" } });
        const r = await upload({ data: { fileName: "ai-picture.png", contentType: dataUrl.slice(5, dataUrl.indexOf(";")), base64: dataUrl.split(",")[1] ?? "" } });
        onPick({ url: r.url, alt: "" });
      })}><Sparkles className="mr-1 h-4 w-4" />{busy === "ai" ? "Creating…" : "Create with AI"}</Button>
    </div>
  );
}
