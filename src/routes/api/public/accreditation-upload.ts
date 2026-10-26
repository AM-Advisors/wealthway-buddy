import { createFileRoute } from "@tanstack/react-router";
import { REQUEST_LIMITS, UPLOAD_TYPES } from "@/lib/accreditation-evidence-options";

/** Public upload for a professional's accreditation letter. The single-use token is the only credential. */
export const Route = createFileRoute("/api/public/accreditation-upload")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
        try {
          const form = await request.formData();
          const token = String(form.get("token") ?? "");
          const license = String(form.get("license") ?? "").trim();
          const file = form.get("file");
          if (token.length < 20 || token.length > 200) return json(400, { error: "This link is not valid." });
          if (license.length < 2 || license.length > 80) return json(400, { error: "Enter your license or registration number." });
          if (!(file instanceof File)) return json(400, { error: "Choose a file to upload." });
          if (file.size > REQUEST_LIMITS.maxFileBytes) return json(400, { error: "Files must be 15 MB or smaller." });
          if (!UPLOAD_TYPES.includes(file.type)) return json(400, { error: "Upload a PDF or image." });
          const { acceptUpload } = await import("@/lib/accreditation-professional.server");
          await acceptUpload(token, file, license);
          return json(200, { ok: true });
        } catch (e) {
          return json(400, { error: e instanceof Error ? e.message : "Upload failed." });
        }
      },
    },
  },
});
