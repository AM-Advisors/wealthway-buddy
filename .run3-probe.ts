const m = await import("@/lib/capital-calls.server");
const d = await import("@/lib/distributions.server");
const a = await import("@/lib/accounting-phase5.server");
console.log(Object.keys(m).join(","));
console.log(Object.keys(d).filter(k=>/[A-Z]/.test(k[0])===false).join(","));
console.log(Object.keys(a).join(","));
