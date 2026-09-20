/**
 * The two calls Operations Home makes. Both are authenticated, and the work
 * itself is gathered and narrowed on the server — the browser never receives
 * an item the signed-in staff member is not entitled to act on.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { OPS_AREAS } from "@/lib/ops-capabilities";
import { WORK_PRIORITIES, WORK_SECTIONS } from "@/lib/ops-work-items";

const filters = z
  .object({
    clientId: z.string().uuid().optional(),
    fundId: z.string().uuid().optional(),
    area: z.enum(OPS_AREAS).optional(),
    workflowState: z.string().max(40).optional(),
    assignedTo: z.string().uuid().optional(),
    scope: z.enum(["mine", "all"]).optional(),
    dueBefore: z.string().max(40).optional(),
    priority: z.enum(WORK_PRIORITIES).optional(),
    blocked: z.boolean().optional(),
    section: z.enum(WORK_SECTIONS).optional(),
  })
  .optional();

const queueInput = z.object({
  filters,
  page: z.number().int().min(1).max(500).optional(),
  pageSize: z.number().int().min(5).max(100).optional(),
});

const server = () => import("@/lib/ops-work-queue.server");

export const getOpsWorkQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => queueInput.parse(data ?? {}))
  .handler(async ({ context, data }) => (await server()).workQueue(context as any, data as any));

export const getOpsRecentActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ limit: z.number().int().min(1).max(50).optional() }).parse(data ?? {}))
  .handler(async ({ context, data }) =>
    (await server()).recentOperationsActivity(context as any, data.limit ?? 20),
  );
