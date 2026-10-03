import { Badge } from "@/components/ui/badge";
import { CHANNEL_LABEL, STATUS_LABEL, type Channel } from "@/lib/marketing-model";

export function mkHead(title: string, description: string) {
  return () => ({
    meta: [
      { title: `${title} - Harmonious Marketing` },
      { name: "description", content: description },
      { property: "og:title", content: `${title} - Harmonious Marketing` },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  });
}

export function MkPage({ title, intro, actions, children }: { title: string; intro: string; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-10">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-3xl">{title}</h1><p className="mt-2 text-sm text-muted-foreground">{intro}</p></div>
        {actions}
      </header>
      {children}
    </main>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const v = status === "published" || status === "sent" ? "default" : status === "failed" || status === "rejected" ? "destructive" : "secondary";
  return <Badge variant={v as never}>{STATUS_LABEL[status] ?? status}</Badge>;
}

/** Channel colors use semantic tokens only. */
export const CHANNEL_CLS: Record<string, string> = {
  linkedin: "bg-primary text-primary-foreground",
  facebook: "bg-accent text-accent-foreground",
  instagram: "bg-secondary text-secondary-foreground border",
  email: "bg-muted text-foreground border",
};
export function ChannelChip({ c }: { c: string }) {
  return <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${CHANNEL_CLS[c] ?? ""}`}>{c === "email" ? "Email" : CHANNEL_LABEL[c as Channel] ?? c}</span>;
}

export const fmt = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—");

/** datetime-local value <-> ISO */
export const toLocalInput = (iso: string | null) => { if (!iso) return ""; const d = new Date(iso); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
export const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);

export async function fileToBase64(f: File): Promise<string> {
  const buf = new Uint8Array(await f.arrayBuffer());
  let s = "";
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}
