import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/lib/require-auth';
import { MAX_ACCESS_DAYS } from '@/lib/report-card-insights-model';

const s = () => import('@/lib/report-card-insights.server');
const id = z.string().uuid();

export const getReportCardService = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => (await s()).serviceOverview(context.userId));
export const getMyReportCardCoverage = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => (await s()).myCoverage(context.userId));
export const getReportCardAlerts = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => (await s()).cardAlerts(context.userId, context.supabase));
export const prepareReportCardDownload = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ cardIds: z.array(id).min(1).max(50), format: z.enum(['pdf', 'csv', 'xlsx', 'json']), scope: z.enum(['card', 'list', 'compare']) }).parse(d))
  .handler(async ({ data, context }) => (await s()).prepareDownload(context.userId, data, context.supabase));
export const compareReportCards = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ a: id, b: id }).refine((x) => x.a !== x.b, 'Choose two different report cards.').parse(d))
  .handler(async ({ data, context }) => (await s()).compareData(context.userId, data.a, data.b, context.supabase));
export const getReportCardDownloads = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => (await s()).downloadHistory(context.userId));
export const getFundInvestorFunnel = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ offeringId: id }).parse(d))
  .handler(async ({ data, context }) => (await s()).fundFunnel(context.userId, data.offeringId));
export const getRequestableReportCards = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => (await s()).requestableCards(context.userId, context.supabase));
export const requestReportCardAccess = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ cardId: id, reason: z.string().trim().min(3, 'Say briefly why you need it.').max(1000) }).parse(d))
  .handler(async ({ data, context }) => (await s()).requestAccess(context.userId, data.cardId, data.reason, context.supabase));
export const getReportCardAccessQueue = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => (await s()).accessQueue(context.userId));
export const decideReportCardAccess = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ requestId: id, decision: z.enum(['approved', 'denied', 'revoked']), days: z.number().int().min(1).max(MAX_ACCESS_DAYS).optional(), reason: z.string().trim().max(1000).default('') }).parse(d))
  .handler(async ({ data, context }) => (await s()).decideAccess(context.userId, data));
export const readGrantedReportCard = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ cardId: id }).parse(d))
  .handler(async ({ data, context }) => (await s()).readGrantedCard(context.userId, data.cardId));
