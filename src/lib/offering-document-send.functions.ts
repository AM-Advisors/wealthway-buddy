import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";

export const listSendableDocumentsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ offeringId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { listSendableDocuments } = await import("./offering-document-send.server");
    return listSendableDocuments(context.userId, data.offeringId);
  });

export const sendDocumentsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    offeringId: z.string().uuid(),
    documentIds: z.array(z.string().uuid()).min(1).max(50),
    onboardingIds: z.array(z.string().uuid()).min(1).max(500),
    note: z.string().max(1000).nullable().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { sendDocumentsToInvestors } = await import("./offering-document-send.server");
    return sendDocumentsToInvestors(context.userId, data);
  });

export const myDocumentInboxFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { myDocumentInbox } = await import("./offering-document-send.server");
    return myDocumentInbox(context.userId);
  });
