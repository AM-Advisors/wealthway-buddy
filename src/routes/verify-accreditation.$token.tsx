import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { resolveProfessionalLinkFn } from "@/lib/accreditation-professional.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/verify-accreditation/$token")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Upload an Accreditation Letter | Harmonious" },
      { name: "description", content: "Securely upload a signed accredited investor verification letter for your client." },
      { property: "og:title", content: "Upload an Accreditation Letter | Harmonious" },
      { property: "og:description", content: "Securely upload a signed accredited investor verification letter for your client." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Page,
});

function Page() {
  const { token } = Route.useParams();
  const resolve = useServerFn(resolveProfessionalLinkFn);
  const q = useQuery({ queryKey: ["pro-link", token], queryFn: () => resolve({ data: { token } }), retry: false });
  const [file, setFile] = useState<File | null>(null);
  const [license, setLicense] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) { setErr("Choose a file to upload."); return; }
    setBusy(true); setErr(null);
    const fd = new FormData(); fd.set("token", token); fd.set("license", license); fd.set("file", file);
    try {
      const r = await fetch("/api/public/accreditation-upload", { method: "POST", body: fd });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Upload failed.");
      setDone(true);
    } catch (e2) { setErr((e2 as Error).message); } finally { setBusy(false); }
  };

  const d = q.data;
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-lg space-y-6 rounded-xl border bg-card p-8">
        <p className="font-heading text-sm font-semibold uppercase tracking-widest text-muted-foreground">Harmonious</p>
        {q.isPending ? <p className="text-sm text-muted-foreground">Checking your link…</p>
          : !d || !d.ok ? <div className="space-y-2"><h1 className="font-heading text-xl font-semibold">Link not available</h1><p className="text-sm text-muted-foreground">{d && !d.ok ? d.reason : "This link is not valid."}</p></div>
          : done ? <div className="space-y-2" role="status"><h1 className="font-heading text-xl font-semibold">Thank you</h1><p className="text-sm text-muted-foreground">Your letter was received. {d.investorName} will be notified once it's reviewed. You can close this page.</p></div>
          : (
            <form onSubmit={submit} className="space-y-5">
              <div className="space-y-1">
                <h1 className="font-heading text-2xl font-semibold">Accreditation letter for {d.investorName}</h1>
                <p className="text-sm text-muted-foreground">{d.investorName} is investing in {d.fundName} and asked you to confirm their accredited investor status.</p>
              </div>
              <details className="rounded-md border bg-muted/40 p-4 text-sm">
                <summary className="cursor-pointer font-medium">Sample letter</summary>
                <p className="mt-3 whitespace-pre-line text-muted-foreground">{`[Your letterhead]\n[Date]\n\nTo whom it may concern:\n\nI have taken reasonable steps to verify that ${d.investorName} is an accredited investor as defined in Rule 501(a) of Regulation D, and I have determined that they are an accredited investor as of the date of this letter. I based this on a review of [describe documents, e.g. tax returns or account statements] within the last 90 days.\n\n[Signature]\n[Name, title, firm]\n[License or registration number]`}</p>
              </details>
              <div className="space-y-2">
                <Label htmlFor="license">Your license or registration number</Label>
                <Input id="license" required maxLength={80} value={license} onChange={(e) => setLicense(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="letter">Signed letter (PDF or image, max 15 MB)</Label>
                <Input id="letter" type="file" accept=".pdf,.png,.jpg,.jpeg,.heic" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              </div>
              {err ? <p className="text-sm text-destructive">{err}</p> : null}
              <Button type="submit" className="w-full" disabled={busy}>{busy ? "Uploading…" : "Upload letter"}</Button>
              <p className="text-xs text-muted-foreground">This private link works once. The file is stored securely and seen only by the investor's fund compliance reviewers.</p>
            </form>
          )}
      </div>
    </main>
  );
}
