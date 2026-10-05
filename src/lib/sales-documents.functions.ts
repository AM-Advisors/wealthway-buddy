import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";

const S = () => import("@/lib/sales-documents.server");
const id = z.object({ id: z.string().uuid() });
const section = z.object({ key: z.string().max(60), title: z.string().max(200), body: z.string().max(20000), question: z.string().max(4000).nullish() });

export const listSalesDocuments = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await S()).listDocuments(context.userId));
export const getSalesDocumentOptions = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await S()).createOptions(context.userId));
export const createSalesDocument = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    kind: z.enum(["proposal", "rfp", "rfq"]), direction: z.enum(["response", "outbound"]), title: z.string().trim().min(2).max(200),
    dealId: z.string().uuid().nullish(), contactId: z.string().uuid().nullish(), clientId: z.string().uuid().nullish(), quoteId: z.string().uuid().nullish(),
    recipientName: z.string().max(200).nullish(), recipientEmail: z.string().email().nullish().or(z.literal("")), dueDate: z.string().nullish(),
  }).parse(d))
  .handler(async ({ data, context }) => (await S()).createDocument(context.userId, { ...data, recipientEmail: data.recipientEmail || null }));
export const getSalesDocument = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).inputValidator((d) => id.parse(d))
  .handler(async ({ data, context }) => (await S()).getDocument(context.userId, data.id));
export const saveSalesDocumentSections = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), sections: z.array(section).max(80) }).parse(d))
  .handler(async ({ data, context }) => (await S()).saveSections(context.userId, data.id, data.sections.map((s) => ({ ...s, question: s.question ?? null }))));
export const uploadSalesDocumentSource = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), name: z.string().max(200), type: z.string().max(200), base64: z.string().max(21_000_000) }).parse(d))
  .handler(async ({ data, context }) => (await S()).uploadSource(context.userId, data.id, data));
export const draftSalesDocumentWithAi = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), brief: z.string().max(4000).nullish() }).parse(d))
  .handler(async ({ data, context }) => (await S()).draftWithAi(context.userId, data.id, data.brief ?? null));
export const requestMarketingHelp = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), note: z.string().trim().min(3).max(2000), sections: z.array(z.string().max(60)).max(80), dueDate: z.string().nullish() }).parse(d))
  .handler(async ({ data, context }) => (await S()).requestHelp(context.userId, data.id, { note: data.note, sections: data.sections, dueDate: data.dueDate || null }));
export const getMarketingAssistQueue = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await S()).marketingQueue(context.userId));
export const claimMarketingAssist = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((d) => id.parse(d))
  .handler(async ({ data, context }) => (await S()).claimHelp(context.userId, data.id));
export const returnMarketingAssist = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), note: z.string().max(2000).nullish() }).parse(d))
  .handler(async ({ data, context }) => (await S()).returnHelp(context.userId, data.id, data.note ?? null));
export const submitSalesDocument = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((d) => id.parse(d))
  .handler(async ({ data, context }) => (await S()).submitForApproval(context.userId, data.id));
export const decideSalesDocument = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), approve: z.boolean(), note: z.string().max(2000).nullish() }).parse(d))
  .handler(async ({ data, context }) => (await S()).decide(context.userId, data.id, data.approve, data.note ?? null));
export const sendSalesDocument = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), subject: z.string().trim().min(1).max(300), message: z.string().max(5000) }).parse(d))
  .handler(async ({ data, context }) => (await S()).sendDocument(context.userId, data.id, data));
export const setSalesDocumentOutcome = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), outcome: z.string().max(40) }).parse(d))
  .handler(async ({ data, context }) => (await S()).setOutcome(context.userId, data.id, data.outcome));
export const exportSalesDocument = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), format: z.enum(["pdf", "docx"]) }).parse(d))
  .handler(async ({ data, context }) => (await S()).exportDocument(context.userId, data.id, data.format));
