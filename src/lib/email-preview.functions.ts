import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin access required.");
}

export const listEmailTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { TEMPLATES } = await import("@/lib/email-templates/registry");
    return {
      templates: Object.entries(TEMPLATES).map(([name, entry]) => ({
        name,
        displayName: entry.displayName ?? name,
        previewData: (entry.previewData ?? {}) as Record<string, string>,
      })),
    };
  });

const renderSchema = z.object({
  templateName: z.string().min(1),
  data: z.record(z.string(), z.any()).default({}),
});

export const renderEmailPreview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => renderSchema.parse(data))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);

    const [{ TEMPLATES }, { render }, React] = await Promise.all([
      import("@/lib/email-templates/registry"),
      import("@react-email/render"),
      import("react"),
    ]);

    const entry = TEMPLATES[data.templateName];
    if (!entry) throw new Error("Unknown email template.");

    const props = { ...(entry.previewData ?? {}), ...data.data };
    const html = await render(React.createElement(entry.component, props));
    const subject = typeof entry.subject === "function" ? entry.subject(props) : entry.subject;

    return { subject, html };
  });

/** Existing applications an admin can simulate an email for. */
export const listPreviewInvestors = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabase } = context;

    const { data: apps, error } = await supabase
      .from("investor_applications")
      .select("id, user_id, current_step, status, offerings(name)")
      .order("updated_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);

    const userIds = Array.from(new Set((apps ?? []).map((a: any) => a.user_id).filter(Boolean)));
    const profileMap = new Map<string, { legal_name?: string | null; email?: string | null }>();
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, legal_name, email")
        .in("user_id", userIds);
      for (const p of profiles ?? []) profileMap.set((p as any).user_id, p as any);
    }

    const { stepKeyFromApplication } = await import("@/lib/email-templates/steps");

    return {
      investors: (apps ?? []).map((a: any) => {
        const profile = profileMap.get(a.user_id);
        return {
          applicationId: a.id as string,
          investorName: profile?.legal_name ?? "Investor",
          email: profile?.email ?? "",
          offeringName: a.offerings?.name ?? "Harmonious",
          currentStep: stepKeyFromApplication(a.current_step),
          rawStep: (a.current_step ?? "") as string,
          status: (a.status ?? "") as string,
        };
      }),
    };
  });

const sendTestSchema = z.object({
  templateName: z.string().min(1),
  to: z.string().trim().email().max(255),
  data: z.record(z.string(), z.any()).default({}),
  applicationId: z.string().uuid().optional(),
});

const lastPreviewSendByUser = new Map<string, number>();

/** Sends the currently previewed version to one address (admin only). */
export const sendPreviewTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => sendTestSchema.parse(data))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabase, userId } = context;

    const now = Date.now();
    const last = lastPreviewSendByUser.get(userId) ?? 0;
    if (now - last < 15_000) {
      return {
        ok: false,
        message: `Please wait ${Math.ceil((15_000 - (now - last)) / 1000)}s before sending another test.`,
      };
    }
    lastPreviewSendByUser.set(userId, now);

    const { TEMPLATES } = await import("@/lib/email-templates/registry");
    const entry = TEMPLATES[data.templateName];
    if (!entry) throw new Error("Unknown email template.");

    const props: Record<string, any> = { ...(entry.previewData ?? {}), ...data.data };

    // Track the main call-to-action link, matching the live invitation send.
    const linkKey = props["ctaUrl"] ? "ctaUrl" : "portalUrl";
    if (typeof props[linkKey] === "string" && props[linkKey]) {
      try {
        const { buildTrackedUrl } = await import("@/lib/email-tracking.server");
        props[linkKey] = await buildTrackedUrl({
          url: props[linkKey],
          recipient: data.to,
          template: data.templateName,
          label: (props["ctaLabel"] as string) || "Preview test link",
        });
      } catch {
        // Tracking is best-effort; send the plain link if signing is unavailable.
      }
    }

    const subject =
      typeof entry.subject === "function" ? entry.subject(props) : (entry.subject as string);

    let logId: string | null = null;
    if (data.applicationId) {
      const { data: row } = await supabase
        .from("investor_emails")
        .insert({
          application_id: data.applicationId,
          sent_by: userId,
          to_email: data.to,
          subject: `[Preview test] ${subject}`.slice(0, 200),
          body: `Preview test of the "${entry.displayName ?? data.templateName}" design.`,
          status: "queued",
        })
        .select("id")
        .maybeSingle();
      logId = (row as any)?.id ?? null;
    }

    try {
      const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
      const result = await sendTemplateEmail(data.templateName, data.to, {
        templateData: props,
        idempotencyKey: `preview-test-${userId}-${now}`,
      });

      if (!result.sent) {
        if (logId) {
          await supabase
            .from("investor_emails")
            .update({
              status: "suppressed",
              provider_error: "Recipient is suppressed (prior bounce, complaint, or unsubscribe).",
            })
            .eq("id", logId);
        }
        return { ok: false, message: "That address has opted out or previously bounced." };
      }

      if (logId) {
        await supabase.from("investor_emails").update({ status: "sent" }).eq("id", logId);
      }
      return { ok: true, message: `Test sent to ${data.to}.`, subject };
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown error";
      if (logId) {
        await supabase
          .from("investor_emails")
          .update({ status: "failed", provider_error: detail.slice(0, 500) })
          .eq("id", logId);
      }
      return { ok: false, message: "Could not send the test email." };
    }
  });

