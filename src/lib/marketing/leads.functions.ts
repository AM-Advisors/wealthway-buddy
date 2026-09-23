import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { LEAD_INTENTS } from "./site-config";

const opt = (n: number) => z.string().trim().max(n).optional().transform((v) => (v ? v : undefined));

export const leadSchema = z.object({
  name: z.string().trim().min(1, "Please enter your name").max(120),
  workEmail: z.string().trim().email("Please enter a valid email").max(254),
  company: z.string().trim().min(1, "Please enter your company").max(160),
  intent: z.enum(LEAD_INTENTS.map((i) => i.value) as [string, ...string[]]),
  message: opt(2000),
  /** Honeypot — real visitors never fill this. */
  website: z.string().max(0).optional(),
  attribution: z
    .object({
      cta: opt(60),
      sourcePage: opt(300),
      utmSource: opt(200),
      utmMedium: opt(200),
      utmCampaign: opt(200),
      utmContent: opt(200),
      utmTerm: opt(200),
      referrer: opt(300),
    })
    .default({}),
});
export type LeadInput = z.input<typeof leadSchema>;

/** Salesforce-ready shape (standard Lead fields). Pure; used by the future sync. */
export function toSalesforceLead(lead: z.output<typeof leadSchema>) {
  const [first, ...rest] = lead.name.split(/\s+/);
  return {
    FirstName: rest.length ? first : undefined,
    LastName: rest.length ? rest.join(" ") : first,
    Email: lead.workEmail,
    Company: lead.company,
    LeadSource: "Website",
    Description: lead.message,
    Harmonious_Intent__c: lead.intent,
    Harmonious_CTA__c: lead.attribution.cta,
    Harmonious_Source_Page__c: lead.attribution.sourcePage,
    UTM_Source__c: lead.attribution.utmSource,
    UTM_Medium__c: lead.attribution.utmMedium,
    UTM_Campaign__c: lead.attribution.utmCampaign,
    UTM_Content__c: lead.attribution.utmContent,
  };
}

/**
 * Public lead submission. Stores the lead only — it never creates an account,
 * membership, role, fund, company or any other application record.
 */
export const submitLead = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => leadSchema.parse(data))
  .handler(async ({ data }) => {
    if (data.website) return { ok: true as const }; // silently drop bots
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const a = data.attribution;
    const { error } = await supabaseAdmin.from("marketing_leads").insert({
      name: data.name,
      work_email: data.workEmail.toLowerCase(),
      company: data.company,
      intent: data.intent,
      message: data.message ?? null,
      cta: a.cta ?? null,
      source_page: a.sourcePage ?? null,
      utm_source: a.utmSource ?? null,
      utm_medium: a.utmMedium ?? null,
      utm_campaign: a.utmCampaign ?? null,
      utm_content: a.utmContent ?? null,
      utm_term: a.utmTerm ?? null,
      referrer: a.referrer ?? null,
    });
    if (error) {
      console.error("marketing lead insert failed", error.message);
      throw new Error("We couldn't send your request. Please email support@harmonious.co.");
    }
    return { ok: true as const };
  });
