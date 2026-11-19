import { isDemoFundRow } from "@/lib/demo-fund";

/** Reads the fund and its client; unknown funds are never treated as demos. */
export async function isDemoFund(db: any, offeringId: string | null | undefined): Promise<boolean> {
  if (!offeringId) return false;
  const { data: o } = await db.from("offerings").select("is_demo, client_id").eq("id", offeringId).maybeSingle();
  if (!o) return false;
  if (o.is_demo) return true;
  if (!o.client_id) return false;
  const { data: c } = await db.from("clients").select("is_test_demo").eq("id", o.client_id).maybeSingle();
  return isDemoFundRow(o, c);
}
