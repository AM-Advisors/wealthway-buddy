import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";

export const listSendableDocumentsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ offeringId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { listSendableDocuments } = await import("./offering-document-send.server");
    return listSendableDocuments(context.userId, data.offeringId);
  });

export const sendDocumentsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({
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

export const readInvestorDocumentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ offeringId: z.string().uuid(), fileName: z.string().min(1).max(200), contentType: z.string().max(120), base64: z.string().max(14_500_000) }).parse(d))
  .handler(async ({ data, context }) => {
    const { readInvestorDocument } = await import("./investor-update-documents.server");
    return readInvestorDocument(context.userId, data);
  });

export const addInvestorDocumentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({
    offeringId: z.string().uuid(),
    docType: z.enum(["valuation_report", "investor_update", "other"]),
    title: z.string().trim().min(1).max(200),
    filePath: z.string().min(3).max(400),
    fileName: z.string().trim().min(1).max(200),
    fileSizeBytes: z.number().int().min(0).max(60 * 1024 * 1024),
    asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { addInvestorDocument } = await import("./investor-update-documents.server");
    return addInvestorDocument(context.userId, data);
  });
