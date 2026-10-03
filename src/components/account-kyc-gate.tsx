import type { ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { accountKycStatusFn, startAccountCheckFn } from "@/lib/account-kyc.functions";

/** Nobody but Harmonious staff reaches the platform until their identity is verified. Enforced again on the server. */
export function AccountKycGate({ children, onSignOut }: { children: ReactNode; onSignOut: () => void | Promise<void> }) {
  const status = useServerFn(accountKycStatusFn);
  const start = useServerFn(startAccountCheckFn);
  const q = useQuery({
    queryKey: ["account-kyc-status"], queryFn: () => status(), staleTime: 60_000,
    refetchInterval: (query) => { const s = query.state.data?.state; return s === "in_progress" || s === "review" ? 15_000 : false; },
  });
  const m = useMutation({ mutationFn: () => start(), onSuccess: (r) => { if (r.url) window.location.assign(r.url); else void q.refetch(); }, onError: (e: Error) => toast.error(e.message) });
  const s = q.data;
  if (s?.open) return <>{children}</>;

  const body = (() => {
    if (q.isLoading) return { title: "One moment…", text: "Checking your account.", cta: null as string | null };
    if (q.error || !s) return { title: "We couldn't check your account", text: "Please refresh the page. If this keeps happening, contact Harmonious.", cta: null };
    switch (s.state) {
      case "start": return { title: "Verify your identity", text: "Before you can use Harmonious, we verify everyone's identity. This is required for fund administration and anti-money-laundering rules. You'll need a government ID and your phone or computer camera — it takes about 5 minutes. Your ID number is never shown in the portal.", cta: "Start verification" };
      case "in_progress": return { title: "We're checking your details", text: "If you didn't finish, you can continue where you left off. Otherwise this page updates by itself once the check is done.", cta: "Continue verification" };
      case "review": return { title: "Your check is with our compliance team", text: "A Harmonious compliance specialist is reviewing your verification. You'll get access as soon as it's approved — usually within one business day. This page updates by itself.", cta: null };
      default: return { title: s.expired ? "Your ID has expired" : "We need you to try again", text: s.expired ? "The ID you used has expired. Please verify again with a current government-issued ID." : s.declineNote ? `Our team asked you to verify again: ${s.declineNote}` : "We couldn't verify your identity. Please try again, making sure your ID is clear and fully in frame.", cta: "Verify again" };
    }
  })();

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg space-y-5 rounded-xl border bg-card p-6 shadow-sm sm:p-8">
        <Logo className="h-8" />
        <div className="space-y-2">
          <h1 className="font-heading text-2xl text-primary">{body.title}</h1>
          <p className="text-sm text-muted-foreground">{body.text}</p>
        </div>
        <ol className="grid gap-2 text-sm sm:grid-cols-2">
          {["Government ID", "Selfie match", "Residential address", "Sanctions & AML screening"].map((t, i) => (
            <li key={t} className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">{i + 1}</span>{t}</li>
          ))}
        </ol>
        <div className="flex flex-wrap gap-2">
          {body.cta && <Button disabled={m.isPending} onClick={() => m.mutate()}>{m.isPending ? "Opening…" : body.cta}</Button>}
          {(s?.state === "in_progress" || s?.state === "review") && <Button variant="outline" onClick={() => void q.refetch()}>Check again</Button>}
          <Button variant="ghost" onClick={() => void onSignOut()}>Sign out</Button>
        </div>
      </div>
    </div>
  );
}
