import { sendTemplateEmail } from "../src/lib/email-templates/send-email";
const res = await sendTemplateEmail("investor-invitation", "operations@harmonious.co", {
  templateData: {
    investorName: "Alyssa",
    offeringName: "Harmonious",
    portalUrl: "https://onboard.harmonious.co/dashboard",
    contactEmail: "operations@harmonious.co",
  },
  idempotencyKey: `invitation-ops-${Date.now()}`,
});
console.log(JSON.stringify(res));
