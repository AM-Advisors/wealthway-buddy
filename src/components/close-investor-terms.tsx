import type { closeInvestorTerms } from "@/lib/close-investor-terms";
export function CloseInvestorTerms({ investors }: { investors: { id: string; name: string; amountCents?: number | null; terms: ReturnType<typeof closeInvestorTerms> }[] }) {
  return <section className="space-y-3" aria-label="Investor side-letter terms">
    <h3 className="font-semibold">Investor side-letter terms</h3>
    {investors.map(i => <details key={i.id} className="border-b pb-2" open={!!i.terms.error}>
      <summary className="cursor-pointer font-medium">{i.name} · {i.terms.letters.length ? `${i.terms.letters.length} side letter${i.terms.letters.length === 1 ? "" : "s"}` : "No side letter"}</summary>
      <div className="space-y-2 pt-2 text-sm">
        <p>Management fee: {i.terms.feeOverride == null ? "Fund fee" : `${i.terms.feeOverride}%`} · Carry: {i.terms.carryOverride == null ? "Fund terms" : `${i.terms.carryOverride}%`}</p>
        {i.terms.error && <p className="text-destructive">{i.terms.error}</p>}
        {i.terms.letters.map(l => <div key={l.id} className="space-y-1">
          <p className="font-medium">{l.applicable ? "Applicable" : "Not applied"} · {l.status}{l.version != null ? ` · Version ${l.version}` : ""}</p>
          {l.reference && <p className="break-words text-muted-foreground">Document reference: {l.reference}</p>}
          <ul className="list-disc space-y-1 pl-5">{l.terms.map((t, n) => <li key={n}>{t.description || t.category.replaceAll("_", " ")}{t.value ? `: ${t.value}` : ""}{t.applicability ? ` (${t.applicability})` : ""}</li>)}</ul>
        </div>)}
      </div>
    </details>)}
  </section>;
}