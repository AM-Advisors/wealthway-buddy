/**
 * Client accounts a person belongs to: a direct contact row (client_users)
 * plus any client reached through a fund they manage (fund_managers → offerings).
 * The client portal already treats both as membership; every pay/send/save
 * check must use the same rule so managers are not bounced at the last step.
 */
export async function clientAccessIds(supabase: any, userId: string): Promise<string[]> {
  const [{ data: links }, { data: managed }] = await Promise.all([
    supabase.from("client_users").select("client_id").eq("user_id", userId),
    supabase.from("fund_managers").select("offerings(client_id)").eq("user_id", userId),
  ]);
  return [
    ...new Set([
      ...((links ?? []) as any[]).map((l) => String(l.client_id)),
      ...((managed ?? []) as any[])
        .map((m) => String(m.offerings?.client_id))
        .filter((id) => id && id !== "null"),
    ]),
  ];
}
