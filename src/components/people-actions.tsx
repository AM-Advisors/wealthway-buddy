import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { getAccessStatusByEmail, restoreAccess, revokeAccess, setTestDemoFlag } from "@/lib/user-access.functions";

export type AccessInfo = { userId: string; status: string; isTestDemo: boolean; scoped: number };

/** Access status for a list page's emails. Returns null for viewers who can't manage access. */
export function useAccessStatus(emails: string[]) {
  const fn = useServerFn(getAccessStatusByEmail);
  const key = [...new Set(emails.filter(Boolean).map((e) => e.toLowerCase()))].sort();
  return useQuery({ queryKey: ["access-status", key], queryFn: () => fn({ data: { emails: key } }), enabled: key.length > 0, staleTime: 30_000 });
}

export function AccessBadge({ info }: { info?: AccessInfo | null | undefined }) {
  if (!info) return null;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {info.status === "revoked" && <Badge variant="destructive">Revoked</Badge>}
      {info.status === "archived" && <Badge variant="outline">Archived</Badge>}
      {info.scoped > 0 && info.status === "active" && <Badge variant="outline">Partly revoked</Badge>}
      {info.isTestDemo && <Badge variant="secondary">Test/Demo</Badge>}
    </span>
  );
}

type Mode = null | "revoke" | "archive" | "restore";

/**
 * Revoke / archive / restore / test-demo menu for one person. The server re-checks
 * that the caller is Super Admin or an Operations lead on every action.
 */
export function PeopleActions({ email, userId, name, info, context }: {
  email?: string | null; userId?: string | null; name?: string | null; info?: AccessInfo | null | undefined;
  context?: { kind: "client" | "offering"; id: string; label: string } | null;
}) {
  const qc = useQueryClient();
  const revoke = useServerFn(revokeAccess), restore = useServerFn(restoreAccess), flag = useServerFn(setTestDemoFlag);
  const [mode, setMode] = useState<Mode>(null);
  const [scope, setScope] = useState<"global" | "scoped">("global");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const uid = userId ?? info?.userId ?? null;
  const status = info?.status ?? "active";
  if (!uid && !email) return null;

  const done = async (msg: string) => { toast.success(msg); setMode(null); setReason(""); await qc.invalidateQueries(); };
  const submit = async () => {
    setBusy(true);
    try {
      const who = { userId: uid, email: email ?? null };
      if (mode === "restore") { await restore({ data: { ...who, reason } }); await done("Access restored."); }
      else if (mode === "archive") { await revoke({ data: { ...who, scope: "global", reason, archive: true } }); await done("Archived and sign-in blocked."); }
      else if (scope === "scoped" && context) { await revoke({ data: { ...who, scope: context.kind, scopeId: context.id, reason } }); await done(`Removed from ${context.label}.`); }
      else { await revoke({ data: { ...who, scope: "global", reason } }); await done("Sign-in blocked."); }
    } catch (e) { toast.error(e instanceof Error ? e.message : "Something went wrong."); }
    finally { setBusy(false); }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" aria-label={`Access actions for ${name || email}`}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {status === "active" ? <>
            <DropdownMenuItem onClick={() => { setScope(context ? "scoped" : "global"); setMode("revoke"); }}>Revoke access…</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setMode("archive")}>Archive…</DropdownMenuItem>
          </> : <DropdownMenuItem onClick={() => setMode("restore")}>Restore access…</DropdownMenuItem>}
          {uid && <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={async () => { try { await flag({ data: { kind: "user", id: uid, value: !info?.isTestDemo } }); await done(info?.isTestDemo ? "Unmarked as test/demo." : "Marked as test/demo."); } catch (e) { toast.error(e instanceof Error ? e.message : "Failed."); } }}>
              {info?.isTestDemo ? "Unmark test/demo" : "Mark as test/demo"}
            </DropdownMenuItem>
          </>}
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={mode !== null} onOpenChange={(o) => !o && setMode(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{mode === "restore" ? "Restore access" : mode === "archive" ? "Archive person" : "Revoke access"}{name || email ? ` — ${name || email}` : ""}</DialogTitle>
            <DialogDescription>
              {mode === "archive" ? "They're hidden from lists and can't sign in. Records and history are kept; you can restore them later."
                : mode === "restore" ? "Lifts the sign-in block. They can sign in again right away."
                : "Their records, signed documents and history stay untouched."}
            </DialogDescription>
          </DialogHeader>
          {mode === "revoke" && (
            <div className="space-y-2 text-sm">
              <label className="flex items-start gap-2"><input type="radio" checked={scope === "global"} onChange={() => setScope("global")} /> <span><span className="font-medium">Block all sign-in</span><span className="block text-muted-foreground">They can't sign in anywhere and are signed out now.</span></span></label>
              <label className={`flex items-start gap-2 ${context ? "" : "opacity-50"}`}><input type="radio" disabled={!context} checked={scope === "scoped"} onChange={() => setScope("scoped")} /> <span><span className="font-medium">Remove from {context?.label ?? "this client/fund"} only</span><span className="block text-muted-foreground">{context ? "Other access stays." : "Open this person from a client or fund to use this."}</span></span></label>
            </div>
          )}
          <Textarea placeholder="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setMode(null)}>Cancel</Button>
            <Button variant={mode === "restore" ? "default" : "destructive"} disabled={busy || reason.trim().length < 3} onClick={submit}>{busy ? "Working…" : "Confirm"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
