import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
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
