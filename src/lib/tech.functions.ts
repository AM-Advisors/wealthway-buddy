import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";
import { AREAS, PRIORITIES, ROADMAP_COLUMNS } from "@/lib/tech-model";

const T = () => import("@/lib/tech.server");
const backlog = z.object({
  kind: z.enum(["bug", "enhancement"]), title: z.string().trim().min(3).max(200), summary: z.string().max(4000).optional(),
  priority: z.enum(PRIORITIES).optional(), area: z.enum(AREAS).optional(), roadmapColumn: z.enum(ROADMAP_COLUMNS).optional(),
  targetMonth: z.string().regex(/^\d{4}-\d{2}$/).nullish(),
});

export const submitFeedback = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator((d) => z.object({
    kind: z.enum(["bug", "idea"]), title: z.string().trim().min(3, "Give it a short title.").max(200), details: z.string().trim().min(5, "Tell us a little more.").max(4000),
    page: z.string().max(500).nullish(), browser: z.string().max(500).nullish(),
    screenshot: z.object({ name: z.string().max(200), type: z.string().max(40), base64: z.string().max(7_500_000) }).nullish(),
  }).parse(d))
  .handler(async ({ data, context }) => (await T()).submitFeedback(context.userId, data));

export const getMyFeedback = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await T()).myFeedback(context.userId));

export const getFeedbackScreenshot = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => (await T()).screenshotLink(context.userId, data.id));

export const getTechWorkspace = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await T()).techWorkspace(context.userId));

export const triageFeedback = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator((d) => z.object({ id: z.string().uuid(), action: z.enum(["accept", "merge", "needs_info", "not_planned"]), note: z.string().max(2000).nullish(), mergeInto: z.string().uuid().nullish(), backlogItemId: z.string().uuid().nullish(), newItem: backlog.nullish() }).parse(d))
  .handler(async ({ data, context }) => (await T()).triageFeedback(context.userId, data));

export const saveBacklogItem = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator((d) => backlog.extend({ id: z.string().uuid().nullish(), expectedUpdatedAt: z.string().nullish() }).parse(d))
  .handler(async ({ data, context }) => (await T()).saveBacklogItem(context.userId, data));

export const addToBacklog = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator((d) => z.discriminatedUnion("from", [
    z.object({ from: z.literal("error"), message: z.string().max(200), page: z.string().max(200) }),
    z.object({ from: z.literal("software_issue"), issueId: z.string().uuid() }),
  ]).parse(d))
  .handler(async ({ data, context }) => (await T()).addToBacklog(context.userId, data));

export const saveReleaseNote = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator((d) => z.object({ title: z.string().trim().min(3).max(200), body: z.string().trim().min(5).max(8000), audience: z.enum(["staff", "clients"]), itemIds: z.array(z.string().uuid()).max(100) }).parse(d))
  .handler(async ({ data, context }) => (await T()).saveReleaseNote(context.userId, data));

export const publishReleaseNote = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => (await T()).publishReleaseNote(context.userId, data.id));
