// Fund manager profile: their own contact details plus the funds they manage.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getManagerProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId, claims } = context;

    const [{ data: profile }, { data: roles }, { data: assignments }] = await Promise.all([
      supabase
        .from("profiles")
        .select(
          "legal_name, email, phone, entity_name, address_line1, address_line2, city, region, postal_code, country, updated_at",
        )
        .eq("user_id", userId)
        .maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase
        .from("fund_managers")
        .select("offering_id, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: true }),
    ]);

    const roleList = ((roles ?? []) as any[]).map((r) => r.role as string);
    const isAdmin = roleList.includes("admin");
    const assignedRows = (assignments ?? []) as any[];
    const assignedIds = assignedRows.map((a) => a.offering_id as string);

    let funds: Array<{
      id: string;
      name: string;
      slug: string;
      regType: string;
      isOpen: boolean;
      assignedAt: string | null;
      investorCount: number;
      committedCents: number;
    }> = [];

    const fundIds = isAdmin ? null : assignedIds;
    if (isAdmin || assignedIds.length > 0) {
      let q = supabase.from("offerings").select("id, name, slug, reg_type, is_open").order("name");
      if (fundIds) q = q.in("id", fundIds);
      const { data: offerings } = await q;
      const rows = (offerings ?? []) as any[];

      const counts = new Map<string, { investors: number; committed: number }>();
      if (rows.length) {
        let appQuery = supabase
          .from("investor_applications")
          .select("offering_id, commitment_cents");
        appQuery = appQuery.in(
          "offering_id",
          rows.map((r) => r.id as string),
        );
        const { data: apps } = await appQuery;
        for (const a of ((apps ?? []) as any[])) {
          const current = counts.get(a.offering_id) ?? { investors: 0, committed: 0 };
          current.investors += 1;
          current.committed += Number(a.commitment_cents ?? 0);
          counts.set(a.offering_id, current);
        }
      }

      const assignedAtOf = new Map(
        assignedRows.map((a) => [a.offering_id as string, a.created_at as string]),
      );

      funds = rows.map((o) => ({
        id: o.id as string,
        name: o.name as string,
        slug: o.slug as string,
        regType: o.reg_type as string,
        isOpen: Boolean(o.is_open),
        assignedAt: assignedAtOf.get(o.id as string) ?? null,
        investorCount: counts.get(o.id)?.investors ?? 0,
        committedCents: counts.get(o.id)?.committed ?? 0,
      }));
    }

    return {
      isAdmin,
      roles: roleList,
      accountEmail: (claims as any)?.email ?? null,
      profile: {
        legal_name: profile?.legal_name ?? "",
        email: profile?.email ?? ((claims as any)?.email ?? ""),
        phone: profile?.phone ?? "",
        entity_name: profile?.entity_name ?? "",
        address_line1: profile?.address_line1 ?? "",
        address_line2: profile?.address_line2 ?? "",
        city: profile?.city ?? "",
        region: profile?.region ?? "",
        postal_code: profile?.postal_code ?? "",
        country: profile?.country ?? "",
        updated_at: profile?.updated_at ?? null,
      },
      funds,
    };
  });

const profileSchema = z.object({
  legal_name: z.string().min(1).max(200),
  email: z.string().email().max(200),
  phone: z.string().max(50).optional().default(""),
  entity_name: z.string().max(200).optional().default(""),
  address_line1: z.string().max(200).optional().default(""),
  address_line2: z.string().max(200).optional().default(""),
  city: z.string().max(120).optional().default(""),
  region: z.string().max(120).optional().default(""),
  postal_code: z.string().max(40).optional().default(""),
  country: z.string().max(120).optional().default(""),
});

export const saveManagerProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => profileSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const clean = (value: string | undefined) => {
      const trimmed = (value ?? "").trim();
      return trimmed.length ? trimmed : null;
    };

    const payload = {
      legal_name: data.legal_name.trim(),
      email: data.email.trim(),
      phone: clean(data.phone),
      entity_name: clean(data.entity_name),
      address_line1: clean(data.address_line1),
      address_line2: clean(data.address_line2),
      city: clean(data.city),
      region: clean(data.region),
      postal_code: clean(data.postal_code),
      country: clean(data.country),
      updated_at: new Date().toISOString(),
    };

    const { data: existing } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase.from("profiles").update(payload).eq("user_id", userId);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from("profiles").insert({ user_id: userId, ...payload });
      if (error) throw new Error(error.message);
    }

    return { ok: true };
  });
