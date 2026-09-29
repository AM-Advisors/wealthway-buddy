import os, re
os.chdir('/dev-server/src/lib')
def ed(p, pairs, imp=None):
    s=open(p).read()
    for a,b in pairs:
        if a not in s: print("MISSING", p, a[:60]); continue
        s=s.replace(a,b)
    if imp and imp not in s: s=imp+"\n"+s
    open(p,'w').write(s)

p='document-signing.ts'; s=open(p).read()
if 'toSigningExecutionState' not in s:
    old=s[s.index('export function executionState(signers: readonly SignerLike[]): ExecutionState {'):s.index('export const EXECUTION_LABELS')]
    s=s.replace(old,'''export function executionState(signers: readonly SignerLike[]): ExecutionState {
  const c = canonicalExecutionStatus({ signers: signers.map((x) => ({ role: (x as any).role_key ?? (x as any).role ?? null, status: String(x.status), required: x.required ?? true })) });
  return toSigningExecutionState(c);
}

/** Adapter: canonical status -> this module's display state. */
export function toSigningExecutionState(c: CanonicalExecutionStatus): ExecutionState {
  switch (c) {
    case "fully_executed": return "executed";
    case "partially_signed": case "awaiting_countersignature": return "partially_signed";
    case "sent": return "out_for_signature";
    case "needs_review": return "error";
    case "declined": case "expired": case "cancelled": return c;
    default: return "not_sent";
  }
}

''')
    s='import { canonicalExecutionStatus, type CanonicalExecutionStatus } from "@/lib/document-execution-status";\n'+s
    open(p,'w').write(s)
p='offering-document-model.ts'; s=open(p).read()
if 'toOfferingExecutionState' not in s:
    old=s[s.index('export function executionState(signers: { role: string'):s.index('export type InvestmentDocument')]
    s=s.replace(old,'''export function executionState(signers: { role: string; status: string; required?: boolean }[]): ExecutionState {
  return toOfferingExecutionState(canonicalExecutionStatus({ signers }), signers.filter((s) => s.required !== false).length > 0);
}

/** Adapter: canonical status -> Offering Documents display state. */
export function toOfferingExecutionState(c: CanonicalExecutionStatus, hasSigners: boolean): ExecutionState {
  if (c === "fully_executed") return "fully_executed";
  if (c === "awaiting_countersignature") return "awaiting_countersignature";
  if (c === "partially_signed") return "partially_signed";
  return hasSigners || c === "sent" ? "sent" : "not_sent";
}

''')
    s='import { canonicalExecutionStatus, type CanonicalExecutionStatus } from "@/lib/document-execution-status";\n'+s
    open(p,'w').write(s)
ed('offering-document-setup.server.ts',[
 ('const exec = sig?.provider_completed_at ? "fully_executed" : rows.length ? executionState(rows) : sig?.provider_sent_at ? "sent" : "not_sent";',
  'const exec = toOfferingExecutionState(canonicalExecutionStatus({ signers: rows, providerCompleted: Boolean(sig?.provider_completed_at), providerSent: Boolean(sig?.provider_sent_at) }), rows.length > 0 || Boolean(sig?.provider_completed_at));'),
 ("  executionState,\n","  toOfferingExecutionState,\n")],
 'import { canonicalExecutionStatus } from "@/lib/document-execution-status";')
ed('manager-fund.functions.ts',[('providerStatus: inv?.status === "signed" && fm.status === "signed" ? "completed" : "in_progress",',
 'providerStatus: canonicalExecutionStatus({ signers: list.map((r: any) => ({ role: r.role_key, status: String(r.status) })) }) === "fully_executed" ? "completed" : "in_progress",')],
 'import { canonicalExecutionStatus } from "@/lib/document-execution-status";')

# ---- funding: generic regex sweep
os.chdir('/dev-server/src')
F='import { isReconciledFunding } from "@/lib/funding-status";'
pat = re.compile(r'([A-Za-z_][\w.?]*?(?:funding_status|fundingStatus))\s*===\s*"(?:settled|funded)"')
pat2 = re.compile(r'String\(([\w.?]+)\)\s*===\s*"funded"')
pat3 = re.compile(r'String\(([\w.?]+) \?\? ""\)\s*===\s*"funded"')
pat4 = re.compile(r'\["settled", "funded"\]\.includes\(String\(([\w.?]+) \?\? ""\)\)')
def addimp(n):
    if F in n: return n
    lines=n.split("\n")
    ids=[i for i,l in enumerate(lines) if l.startswith("import ")]
    if not ids: return F+"\n"+n
    idx=max(ids)
    j=idx
    while not lines[j].rstrip().endswith(";"): j+=1
    lines.insert(j+1,F); return "\n".join(lines)
for root in ['lib','components','routes']:
    for dp,_,fs in os.walk(root):
        for f in fs:
            if not f.endswith(('.ts','.tsx')) or '.test.' in f or f=='funding-status.ts': continue
            p=os.path.join(dp,f); s=open(p).read()
            n=pat.sub(lambda m: f'isReconciledFunding({m.group(1)})', s)
            n=pat4.sub(lambda m: f'isReconciledFunding({m.group(1)})', n)
            if 'readiness' in f or 'fund-onboarding-model' in f:
                n=pat2.sub(lambda m: f'isReconciledFunding({m.group(1)})', n)
                n=pat3.sub(lambda m: f'isReconciledFunding({m.group(1)})', n)
            n=n.replace('if (f === "funded") funding =','if (isReconciledFunding(f)) funding =')
            n=n.replace('if (s === "funded") return "Funded";','if (isReconciledFunding(s)) return "Funded";')
            if n!=s:
                open(p,'w').write(addimp(n)); print("edited",p)
p='lib/fund-billing.functions.ts'; s=open(p).read()
s=s.replace('if (!SETTLED.includes(String(a.funding_status ?? ""))) continue;','if (!isReconciledFunding(a.funding_status) && String(a.funding_status ?? "") !== "closed") continue;')
s=s.replace('const SETTLED = ["settled", "funded", "closed"];\n','')
open(p,'w').write(addimp(s))
p='lib/funding-dashboard.functions.ts'; s=open(p).read()
s=s.replace('(a) => !["settled", "funded", "closed", "declined"].includes(String(a.funding_status ?? "")),','(a) => !isReconciledFunding(a.funding_status) && !["closed", "declined"].includes(String(a.funding_status ?? "")),')
open(p,'w').write(addimp(s))
print("done")
