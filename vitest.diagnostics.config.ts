import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { environment: "node", setupFiles: ["./src/lib/diagnostics-offline.setup.ts"], include: ["src/lib/diagnostic*.test.ts", "src/lib/email-diagnostic-access.test.ts", "src/lib/email-diagnostic-boundary.test.ts", "src/lib/marketing-jobs-model.test.ts", "e2e/qa-safety.test.ts"] },
});