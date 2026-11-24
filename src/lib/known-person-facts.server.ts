import { knownPersonFacts, type KnownPersonFacts } from "./known-person-facts";

/** The signed-in person's own facts across their person record, their own individual investing profile and their login. */
export async function ownKnownFacts(userId: string): Promise<KnownPersonFacts> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const d = supabaseAdmin as any;
  const [{ data: person }, { data: login }, { data: own }] = await Promise.all([
    d.from("persons").select("legal_first_name, legal_middle_name, legal_last_name, date_of_birth, citizenship_country, phone, address_line1, city, region, postal_code, country").eq("user_id", userId).is("merged_into_person_id", null).limit(1).maybeSingle(),
    d.from("profiles").select("legal_name, phone, date_of_birth, address_line1, city, region, postal_code, country").eq("user_id", userId).maybeSingle(),
    d.from("investment_profiles").select("legal_name, phone, address_line1, city, region, postal_code, country").eq("owner_user_id", userId).eq("profile_type", "individual").neq("status", "archived").order("updated_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  return knownPersonFacts(person, own, login);
}
