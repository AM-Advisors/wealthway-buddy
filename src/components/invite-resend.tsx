import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { resendInvitation as resendDirectoryInvite } from "@/lib/user-access.functions";
import { resendInvitation as resendFundInvite } from "@/lib/invitations.functions";
import { inviteClientContact } from "@/lib/client-contacts.functions";
import { resendOnboardInvitationFn } from "@/lib/investor-onboarding.functions";

export type ResendTarget =
  | { kind: "directory"; table: string; id: string }
  | { kind: "fund"; id: string }
  | { kind: "contact"; id: string }
  | { kind: "onboarding"; invitationId: string };

const targetKey = (t: ResendTarget) => (t.kind === "directory" ? `${t.table}:${t.id}` : t.kind === "onboarding" ? `onboarding:${t.invitationId}` : `${t.kind}:${t.id}`);
const DEFAULT_MESSAGE = "Invitation resent with a fresh link; the old link stops working.";

/**
 * The one resend-invite action used everywhere. Each send goes through the
 * existing server functions, which re-check the caller's permission.
 */
export function useResendInvite() {
  const directory = useServerFn(resendDirectoryInvite);
  const fund = useServerFn(resendFundInvite);
  const contact = useServerFn(inviteClientContact);
  const onboarding = useServerFn(resendOnboardInvitationFn);
  const qc = useQueryClient();
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const send = async (target: ResendTarget, message = DEFAULT_MESSAGE) => {
    const key = targetKey(target);
    setPendingKey(key);
    try {
      const result = await (target.kind === "directory"
        ? directory({ data: { table: target.table as "staff_invitations" | "client_invitations" | "fund_invitations", id: target.id } })
        : target.kind === "fund"
          ? fund({ data: { id: target.id } })
          : target.kind === "contact"
            ? contact({ data: { id: target.id } })
            : onboarding({ data: { invitationId: target.invitationId } }));
      if (result && typeof result === "object" && "sent" in result && (result as { sent?: boolean }).sent === false) {
        toast.error("The invitation was updated but the email could not be sent.");
      } else {
        toast.success(message);
      }
      await qc.invalidateQueries();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not resend the invitation.");
    } finally {
      setPendingKey(null);
    }
  };
  return { send, isPending: (t: ResendTarget) => pendingKey === targetKey(t) };
}

export function ResendInviteButton({ target, onSend, label = "Resend invite", size = "sm", variant = "outline", message, disabled, className }: {
  target?: ResendTarget;
  /** Custom send path for flows that build their own invitation (still shows the shared wording). */
  onSend?: () => Promise<unknown>;
  label?: string;
  size?: "sm" | "default";
  variant?: "outline" | "ghost" | "secondary";
  message?: string;
  disabled?: boolean;
  className?: string;
}) {
  const { send, isPending } = useResendInvite();
  const busy = onSend || !target ? false : isPending(target);
  return (
    <Button
      size={size}
      variant={variant}
      className={className}
      disabled={disabled || busy}
      onClick={() => (onSend
        ? void onSend().catch((e: unknown) => toast.error(e instanceof Error ? e.message : "Could not resend the invitation."))
        : target ? void send(target, message) : undefined)}
    >
      <RotateCcw className={busy ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
      {busy ? "Sending…" : label}
    </Button>
  );
}

export function ResendInviteMenuItem({ target, label = "Resend invite", message }: { target: ResendTarget; label?: string; message?: string }) {
  const { send, isPending } = useResendInvite();
  const busy = isPending(target);
  return (
    <DropdownMenuItem disabled={busy} onClick={() => void send(target, message)}>
      <RotateCcw className={busy ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
      {busy ? "Sending…" : label}
    </DropdownMenuItem>
  );
}
