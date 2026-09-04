// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import path from "node:path";
import { loadEnv, type Plugin } from "vite";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Server routes need non-VITE_ env vars (e.g. SUPABASE_SERVICE_ROLE_KEY,
// LOVABLE_API_KEY). Load them into process.env for server-side code only —
// never add these to the client envDefine block.
function serverEnvPlugin(): Plugin {
  return {
    name: "server-env",
    config(_, env) {
      Object.assign(process.env, loadEnv(env.mode, process.cwd(), ""));
    },
  };
}

export default defineConfig({
  plugins: [serverEnvPlugin()],
  vite: {
    resolve: {
      alias: {
        // React Email's htmlparser2 needs entities v4.5.0; bypass nested v7 copies.
        "entities/lib/decode.js": path.resolve(__dirname, "node_modules/entities/lib/decode.js"),
        "entities/lib/encode.js": path.resolve(__dirname, "node_modules/entities/lib/encode.js"),
        entities: path.resolve(__dirname, "node_modules/entities"),
      },
    },
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
