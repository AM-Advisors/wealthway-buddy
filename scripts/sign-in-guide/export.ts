import { SIGN_IN_GUIDES, SUPPORT_EMAIL } from "@/lib/sign-in-guide-content";
await Bun.write("/tmp/sig/content.json", JSON.stringify({ guides: SIGN_IN_GUIDES, support: SUPPORT_EMAIL }, null, 1));
