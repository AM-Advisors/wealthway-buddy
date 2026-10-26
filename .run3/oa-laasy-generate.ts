/**
 * Generate the SPV Operating Agreement (LLOA) for Corps LaaSy from the approved
 * template, as staff actor Alyssa. Prints autofill results; does not send.
 */
import { useTemplateInFund } from "@/lib/fund-doc-templates.server";

const ALYSSA = "fcf83359-0486-402d-83b4-fd5484fb663d";
const FUND = "92252b98-c5d2-444a-8620-fb29436a87cf";
const TEMPLATE = "88ba9e2c-09fd-4f3a-bb8d-9ff025e3bfbc"; // SPV Operating Agreement (LLOA)

const r = await useTemplateInFund(ALYSSA, { templateId: TEMPLATE, version: 1, offeringId: FUND });
console.log(JSON.stringify(r, null, 2));
