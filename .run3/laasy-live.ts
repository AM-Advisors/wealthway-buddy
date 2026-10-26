import { sendTemplateEmail } from "@/lib/email-templates/send-email";
import { fundLiveKey } from "@/lib/fund-live-notify.server";
const setup = "f44718cb-a286-4c52-b582-a64ced2c389c", fund = "92252b98-c5d2-444a-8620-fb29436a87cf";
for (const r of [
  { id: "a1387cfc-46e5-4dd4-b16b-d63730123794", email: "thomas.morgan@corpscappartners.com", name: "Thomas" },
  { id: "3b2c3778-ba88-40e5-979c-019f865d5940", email: "constantinos.maniatis@corpscapadvisors.com", name: "Tino" },
]) {
  try {
    const res = await sendTemplateEmail("fund-live", r.email, { managed: true, idempotencyKey: fundLiveKey(setup, r.id), templateData: {
      name: r.name, fundName: "Corps LaaSy, a series of AM SPV Fund Management", launchDate: "October 26, 2026",
      onboardingUrl: "https://app.harmonious.co/invest/corps-laasy-a-series-of-am-spv-fund-management",
      fundUrl: `https://app.harmonious.co/client/funds/${fund}` } });
    console.log(r.name, JSON.stringify(res));
  } catch (e) { console.log(r.name, "FAILED", (e as Error).message); }
}
