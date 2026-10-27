import { setupActor, forbid } from "@/lib/fund-setup.server";
import { mayGenerateFundDocuments } from "./fund-document-generation-policy";

export async function fundDocumentGenerationAccess(userId: string, offeringId: string) {
  const actor = await setupActor(userId);
  const managesFund = actor.offeringIds.includes(offeringId);
  if (!actor.isStaff && !managesFund) forbid("you do not manage that fund.");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await (supabaseAdmin as any).from("offerings").select("service_level").eq("id", offeringId).maybeSingle();
  if (error || !data) throw new Error("Could not check this fund's service level.");
  return { actor, allowed: mayGenerateFundDocuments(actor.isStaff, managesFund, data.service_level) };
}

export async function assertFundDocumentGeneration(userId: string, offeringId: string) {
  const access = await fundDocumentGenerationAccess(userId, offeringId);
  if (!access.allowed) forbid("fund document generation is available to Harmonious staff or Self Serve fund managers.");
  return access.actor;
}