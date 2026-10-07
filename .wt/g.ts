import { guard } from "./lib"; await guard(); console.log("guard ok");
const a = await import("@/lib/accounting-phase5.server"); console.log(Object.keys(a).length);
