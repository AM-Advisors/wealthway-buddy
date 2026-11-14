import { FOUNDATION_COMPONENTS, FOUNDATION_SOW_TERMS, FOUNDATION_ROLE_DISCLAIMER } from "../../src/lib/foundation-admin-model";
import { SOW_ROLE_DISCLAIMER } from "../../src/lib/agreement-templates";
const price: Record<string,string> = { formation_planning: "$1,500 one-time", formation_incorporation: "$1,000 one-time", formation_governing_documents: "$2,500 one-time", exemption_application: "$3,500 one-time", state_registrations: "$1,000 one-time", operating_reporting: "$1,250 per month" };
const comps = FOUNDATION_COMPONENTS.filter(c => c.group === "formation").map(c => ({ name: c.name, summary: c.summary, deliverables: c.deliverables, included: c.included, excluded: c.excluded, price: price[c.key] }));
console.log(JSON.stringify({ comps, terms: FOUNDATION_SOW_TERMS.map(t => [t.title, t.body]), disc: [...SOW_ROLE_DISCLAIMER.split("\n\n"), FOUNDATION_ROLE_DISCLAIMER] }));
