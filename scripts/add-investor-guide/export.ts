import { ADD_INVESTOR_GUIDE } from "@/lib/add-investor-guide-content";
import { SUPPORT_EMAIL } from "@/lib/sign-in-guide-content";
await Bun.write("/tmp/aig/content.json", JSON.stringify({ guide: ADD_INVESTOR_GUIDE, support: SUPPORT_EMAIL }, null, 1));
