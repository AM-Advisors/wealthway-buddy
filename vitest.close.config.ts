import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Offline handler tests bypass Start's RPC transform and substitute every backend dependency.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { environment: "node", include: ["src/lib/close-attachments*.test.ts", "src/lib/close-harmonious-fees*.test.ts", "src/lib/fund-close-request-model.test.ts", "src/lib/close-investor-terms.test.ts", "src/lib/commercial-pricing.test.ts", "src/lib/close-side-letter-pricing.test.ts"] },
});