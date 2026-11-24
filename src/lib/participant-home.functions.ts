import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/lib/require-auth";

export const myParticipantAssignmentsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { myParticipantAssignments } = await import("@/lib/onboarding-participants.server");
    return myParticipantAssignments(context.userId);
  });