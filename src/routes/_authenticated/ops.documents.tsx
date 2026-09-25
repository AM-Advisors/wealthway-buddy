import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getDriveIntakeAccess } from "@/lib/drive-intake.functions";
import { ImportedDocumentsList } from "@/components/imported-documents-list";

import { AgreementPreparation } from "@/components/agreement-preparation";
import { AgreementsPipeline } from "@/components/agreements-pipeline";
import { OpsSignatureRequests } from "@/components/ops-signature-requests";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ActivityPanel } from "@/components/activity-panel";
import { DriveExceptions } from "@/components/drive-exceptions";
import { DriveImportsCard } from "@/components/drive-import";

export const Route = createFileRoute("/_authenticated/ops/documents")({
  head: () => ({
    meta: [
      { title: "Documents and signatures — Harmonious operations" },
      {
        name: "description",
        content:
          "Track every agreement out for signature: required signers, capacity, sent, viewed, signed, declined and expired.",
      },
      { property: "og:title", content: "Documents and signatures — Harmonious operations" },
      {
        property: "og:description",
        content:
          "Signature state comes from Box itself; completed agreements are versioned and never rewritten.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OpsDocuments,
});

function OpsDocuments() {
  const access = useServerFn(getDriveIntakeAccess);
  // UX only: the server refuses every import call from anyone else.
  const { data } = useQuery({ queryKey: ["drive-intake-access"], queryFn: () => access() });
  const canImport = data?.allowed === true;
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-semibold">Documents and signatures</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Agreements live in Box, which also runs the signing ceremony. A signature counts only once
        Box confirms it, and the exact document version signed is recorded with it.
      </p>

      <Tabs defaultValue="signatures" className="mt-6">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="prepare">Prepare</TabsTrigger>
          <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
          <TabsTrigger value="signatures">Signature requests</TabsTrigger>
          <TabsTrigger value="drive">Drive exceptions</TabsTrigger>
          <TabsTrigger value="library">Historical records</TabsTrigger>
          {canImport ? <TabsTrigger value="drive-import">Import from Google Drive</TabsTrigger> : null}
          <TabsTrigger value="activity">Audit trail</TabsTrigger>
        </TabsList>
        <TabsContent value="prepare" className="mt-6">
          <AgreementPreparation />
        </TabsContent>
        <TabsContent value="pipeline" className="mt-6">
          <AgreementsPipeline />
        </TabsContent>
        <TabsContent value="signatures" className="mt-6">
          <OpsSignatureRequests />
        </TabsContent>
        <TabsContent value="drive" className="mt-6">
          <DriveExceptions />
        </TabsContent>
        <TabsContent value="library" className="mt-6">
          <ImportedDocumentsList title="Historical records" />
        </TabsContent>
        {canImport ? (
          <TabsContent value="drive-import" className="mt-6">
            <DriveImportsCard />
          </TabsContent>
        ) : null}
        <TabsContent value="activity" className="mt-6">
          <ActivityPanel
            areas={["document"]}
            title="Document history"
            description="Who authored, prepared, sent, resent, cancelled and completed each agreement, and when."
            limit={100}
          />
        </TabsContent>
      </Tabs>

      <p className="mt-8 text-sm text-muted-foreground">
        Looking for stored files?{" "}
        <Link to="/admin/document-log" className="underline underline-offset-4">
          Open the document log
        </Link>
        .
      </p>
    </main>
  );
}
