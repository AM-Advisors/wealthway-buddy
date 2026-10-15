import { Check, PenLine, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export type SignatureMethod = "typed" | "drawn" | "uploaded";
export type AdoptedSignature = { method: SignatureMethod; image: string; name: string };

const SCRIPT_FONTS = ["Dancing Script", "Great Vibes", "Caveat"] as const;
const W = 600;
const H = 180;

/** Renders text in a script font onto a transparent PNG. */
async function renderTyped(text: string, font: string): Promise<string> {
  try {
    await document.fonts.load(`64px "${font}"`);
  } catch {
    /* fall back to whatever is loaded */
  }
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  let size = 72;
  ctx.font = `${size}px "${font}", cursive`;
  while (ctx.measureText(text).width > W - 40 && size > 24) {
    size -= 4;
    ctx.font = `${size}px "${font}", cursive`;
  }
  ctx.fillStyle = "#142647";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 20, H / 2);
  return c.toDataURL("image/png");
}

/** Shrinks an uploaded image onto a W×H transparent PNG. */
async function normaliseUpload(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const ctx = c.getContext("2d")!;
    const scale = Math.min(W / img.width, H / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
    return c.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * "Adopt your signature" pop-up, like Box / Adobe Sign: type it (choose a
 * style), draw it, or upload a picture. Returns a PNG the signing screen
 * places into each "Sign here" tag.
 */
export function SignatureAdoptDialog({
  open,
  onOpenChange,
  defaultName,
  onAdopt,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultName?: string;
  onAdopt: (sig: AdoptedSignature) => void;
}) {
  const [tab, setTab] = useState<SignatureMethod>("typed");
  const [name, setName] = useState(defaultName ?? "");
  const [font, setFont] = useState<string>(SCRIPT_FONTS[0]);
  const [upload, setUpload] = useState<string | null>(null);
  const [drawn, setDrawn] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);

  useEffect(() => {
    if (open && defaultName && !name) setName(defaultName);
  }, [open, defaultName, name]);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };
  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    canvasRef.current!.setPointerCapture(e.pointerId);
    drawing.current = true;
    const p = point(e);
    ctx.strokeStyle = "#142647";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    const p = point(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    setDrawn(true);
  };
  const onUp = () => {
    drawing.current = false;
  };
  const clearPad = () => {
    canvasRef.current?.getContext("2d")?.clearRect(0, 0, W, H);
    setDrawn(false);
  };

  const ready =
    name.trim().length > 1 &&
    (tab === "typed" || (tab === "drawn" && drawn) || (tab === "uploaded" && Boolean(upload)));

  const adopt = async () => {
    let image = "";
    if (tab === "typed") image = await renderTyped(name.trim(), font);
    else if (tab === "drawn") image = canvasRef.current!.toDataURL("image/png");
    else image = upload!;
    onAdopt({ method: tab, image, name: name.trim() });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Adopt your signature</DialogTitle>
          <DialogDescription>Type, draw or upload it once. We'll place it in every spot you click.</DialogDescription>
        </DialogHeader>

        <div className="space-y-1">
          <Label htmlFor="sig-name">Full legal name</Label>
          <Input id="sig-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as SignatureMethod)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="typed">Type</TabsTrigger>
            <TabsTrigger value="drawn"><PenLine className="mr-1 h-3.5 w-3.5" />Draw</TabsTrigger>
            <TabsTrigger value="uploaded"><Upload className="mr-1 h-3.5 w-3.5" />Upload</TabsTrigger>
          </TabsList>

          <TabsContent value="typed" className="space-y-2">
            {SCRIPT_FONTS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFont(f)}
                className={cn(
                  "flex w-full items-center justify-between rounded-md border px-4 py-3 text-left",
                  font === f ? "border-primary ring-2 ring-primary/30" : "hover:bg-muted/50",
                )}
              >
                <span className="truncate text-3xl text-primary" style={{ fontFamily: `"${f}", cursive` }}>
                  {name.trim() || "Your name"}
                </span>
                {font === f && <Check className="h-4 w-4 text-primary" />}
              </button>
            ))}
          </TabsContent>

          <TabsContent value="drawn" className="space-y-2">
            <canvas
              ref={canvasRef}
              width={W}
              height={H}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerLeave={onUp}
              className="aspect-[10/3] w-full touch-none rounded-md border border-dashed bg-background"
              aria-label="Draw your signature"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Sign with your mouse or finger.</span>
              <button type="button" className="underline" onClick={clearPad}>Clear</button>
            </div>
          </TabsContent>

          <TabsContent value="uploaded" className="space-y-2">
            <label className="flex aspect-[10/3] w-full cursor-pointer items-center justify-center rounded-md border border-dashed bg-background text-sm text-muted-foreground">
              {upload ? <img src={upload} alt="Uploaded signature" className="max-h-full" /> : "Choose a photo of your signature (PNG or JPG)"}
              <input
                type="file"
                accept="image/png,image/jpeg"
                className="sr-only"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) setUpload(await normaliseUpload(f));
                }}
              />
            </label>
          </TabsContent>
        </Tabs>

        <p className="text-xs text-muted-foreground">
          By clicking Adopt and sign, I agree this is my legal electronic signature.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!ready} onClick={() => void adopt()}>Adopt and sign</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Yellow "Sign here" tag. Shows the adopted signature once applied. */
export function SignHereTag({
  signature,
  signed,
  onClick,
  label = "Sign here",
}: {
  signature: AdoptedSignature | null;
  signed: boolean;
  onClick: () => void;
  label?: string;
}) {
  if (signed && signature) {
    return (
      <button type="button" onClick={onClick} className="block rounded-md border-b-2 border-primary/40 px-2 pt-1" title="Change signature">
        <img src={signature.image} alt={`Signature of ${signature.name}`} className="h-14" />
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex animate-pulse items-center gap-2 rounded-md border-2 border-warning bg-warning/20 px-4 py-3 text-sm font-semibold text-foreground hover:animate-none"
    >
      <PenLine className="h-4 w-4" /> {label}
    </button>
  );
}

/** Hook bundling the dialog + per-tag state for one signing screen. */
export function useSignHere(defaultName?: string) {
  const [signature, setSignature] = useState<AdoptedSignature | null>(null);
  const [signed, setSigned] = useState(false);
  const [open, setOpen] = useState(false);
  const click = () => {
    if (signature && !signed) setSigned(true);
    else setOpen(true);
  };
  const dialog = (
    <SignatureAdoptDialog
      open={open}
      onOpenChange={setOpen}
      defaultName={defaultName}
      onAdopt={(s) => {
        setSignature(s);
        setSigned(true);
      }}
    />
  );
  return { signature, signed: signed && Boolean(signature), click, dialog };
}
