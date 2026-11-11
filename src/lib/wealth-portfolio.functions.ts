import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from './require-auth';
import { ENTITY_TYPES, SELF } from './wealth-portfolio-model';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const uuid = z.string().uuid();
const cents = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const today = () => new Date().toISOString().slice(0, 10);

export const getWealthPortfolioView = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ ownerUserId: uuid.optional(), asOf: date.optional(), periodStart: date.optional() }).parse(d ?? {}))
  .handler(async ({ context, data }) => {
    const asOf = data.asOf && data.asOf <= today() ? data.asOf : today();
    const { portfolioView } = await import('./wealth-portfolio.server');
    const { quarterOf } = await import('./wealth-portfolio-model');
    const periodStart = data.periodStart && data.periodStart <= asOf ? data.periodStart : quarterOf(asOf).start;
    return portfolioView(context.userId, data.ownerUserId ?? context.userId, asOf, periodStart);
  });

export const listWealthPortfolioSubjects = createServerFn({ method: 'GET' }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await import('./wealth-portfolio.server')).portfolioSubjects(context.userId));

const entityDetail = z.object({ name: z.string().trim().min(1).max(160), entityType: z.enum(ENTITY_TYPES), investmentProfileId: uuid.nullable().default(null) });
const ownershipDetail = z.object({ parentId: z.union([z.literal(SELF), uuid]), childId: uuid, pctBps: z.number().int().min(0).max(10000).nullable() });
const commitmentDetail = z.object({ name: z.string().trim().min(1).max(160), currency: z.string().regex(/^[A-Z]{3}$/), commitmentCents: cents, holderEntityId: uuid.nullable().default(null), holdingId: uuid.nullable().default(null), startDate: date });
const flowDetail = z.object({ commitmentId: uuid, date, flowType: z.enum(['contribution', 'distribution']), status: z.enum(['actual', 'projected']), amountCents: cents.refine(v => v > 0, 'Enter an amount.'), note: z.string().trim().max(500).default('') })
  .refine(v => v.status === 'projected' || v.date <= today(), 'An actual cash flow cannot be dated in the future; mark it projected.');

export const saveWealthPortfolioRecord = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('entity'), priorId: uuid.optional(), archived: z.boolean().optional(), detail: entityDetail }),
    z.object({ kind: z.literal('ownership'), priorId: uuid.optional(), archived: z.boolean().optional(), detail: ownershipDetail }),
    z.object({ kind: z.literal('commitment'), priorId: uuid.optional(), archived: z.boolean().optional(), detail: commitmentDetail }),
    z.object({ kind: z.literal('cash_flow'), priorId: uuid.optional(), archived: z.boolean().optional(), detail: flowDetail }),
  ]).parse(d))
  .handler(async ({ context, data }) => (await import('./wealth-portfolio.server')).saveRecord(context.supabase, context.userId, data));

const importInput = z.object({ kind: z.enum(['holdings', 'private_cash_flows']), fileName: z.string().trim().min(1).max(200), text: z.string().min(1).max(500_000) });
export const previewWealthImport = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => importInput.parse(d))
  .handler(async ({ context, data }) => (await import('./wealth-portfolio.server')).importPreview(context.userId, data));
export const commitWealthImport = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => importInput.extend({ expectedHash: z.string().regex(/^[a-f0-9]{64}$/) }).parse(d))
  .handler(async ({ context, data }) => (await import('./wealth-portfolio.server')).importCommit(context.supabase, context.userId, data));

export const listWealthReports = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ ownerUserId: uuid.optional() }).parse(d ?? {}))
  .handler(async ({ context, data }) => (await import('./wealth-portfolio.server')).reportList(context.userId, data.ownerUserId ?? context.userId));
export const getWealthReportSnapshot = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ reportId: uuid }).parse(d))
  .handler(async ({ context, data }) => (await import('./wealth-portfolio.server')).reportSnapshot(context.userId, data.reportId));
export const publishWealthReport = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ periodEnd: date }).parse(d))
  .handler(async ({ context, data }) => (await import('./wealth-portfolio.server')).publishQuarterReport(context.supabase, context.userId, data.periodEnd));
export const getWealthAuditTrail = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ ownerUserId: uuid.optional() }).parse(d ?? {}))
  .handler(async ({ context, data }) => (await import('./wealth-portfolio.server')).auditTrail(context.userId, data.ownerUserId ?? context.userId));
