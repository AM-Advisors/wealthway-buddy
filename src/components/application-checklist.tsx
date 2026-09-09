import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Circle, Clock, FileText } from "lucide-react";

import { getApplicationChecklist } from "@/lib/subscription.functions";
import { UPLOAD_KINDS } from "@/lib/investor-uploads.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** Which uploads this fund asks for, given who is investing and the Reg D rule. */
function requiredKinds(taxClassification: string, regType: string | null) {
  const kinds = ["identification", "proof_of_address", "tax_form"];
  if (taxClassification === "entity") kinds.push("entity_formation");
  if (taxClassification === "trust") kinds.push("trust_agreement");
  if (taxClassification === "ira") kinds.push("bank_letter");
  if (regType === "506c") kinds.push("other");
  return kinds;
}

const KIND_LABEL = new Map(UPLOAD_KINDS.map((k) => [k.value as string, k.label as string]));

const KIND_HINT: Record<string, string> = {
  identification: "A clear photo or scan of your passport or driver's licence.",
  proof_of_address: "A utility bill or bank statement from the last 90 days.",
  tax_form: "W-9 if you are a US taxpayer, W-8BEN if you are not.",
  entity_formation: "Certificate of formation, operating agreement, and who may sign.",
  trust_agreement: "The trust deed plus the pages naming the trustees.",
  bank_letter: "A letter from your custodian or a voided check.",
  other: "For 506(c) funds: a letter from your CPA, attorney, or adviser confirming you are accredited.",
};

function StatusRow({
  done,
  pending,
  title,
  detail,
}: {
  done: boolean;
  pending?: boolean;
  title: string;
  detail?: string | undefined;
}) {
  const Icon = done ? CheckCircle2 : pending ? Clock : Circle;
  return (
    <li className="flex items-start gap-3 py-2">
      <Icon
        className={`mt-0.5 size-4 shrink-0 ${done ? "text-primary" : pending ? "text-muted-foreground" : "text-muted-foreground/50"}`}
      />
      <div className="min-w-0">
        <p className={`text-sm ${done ? "text-muted-foreground line-through" : "font-medium"}`}>{title}</p>
        {detail ? <p className="text-xs text-muted-foreground">{detail}</p> : null}
      </div>
    </li>
  );
}

export function ApplicationChecklist({ taxClassification }: { taxClassification: string }) {
  const load = useServerFn(getApplicationChecklist);
  const { data } = useQuery({ queryKey: ["application-checklist"], queryFn: () => load() });

  if (!data?.application) return null;

  const offering = data.offering as any;
  const checks = (data.checks ?? {}) as Record<string, string>;
  const uploads = (data.uploads ?? []) as {
    id: string;
    docKind: string;
    fileName: string;
    reviewStatus: string;
  }[];
  const fundDocs = (data.fundDocuments ?? []) as {
    id: string;
    title: string;
    requiresSignature: boolean;
    signed: boolean;
  }[];

  const needed = requiredKinds(taxClassification, (offering?.reg_type as string) ?? null);
  const uploadedKinds = new Set(uploads.map((u) => u.docKind));
  const outstanding = needed.filter((k) => !uploadedKinds.has(k));
  const toSign = fundDocs.filter((d) => d.requiresSignature && !d.signed);

  const isDone = (v?: string) => v === "approved";
  const isPending = (v?: string) => v === "pending" || v === "review";

  return (
    <Card>
      <CardHeader>
        <CardTitle>What {offering?.name ?? "this fund"} needs from you</CardTitle>
        <CardDescription>
          {outstanding.length + toSign.length === 0
            ? "Everything on this fund's list has been submitted. The fund team will confirm once it is reviewed."
            : `${outstanding.length + toSign.length} item${outstanding.length + toSign.length === 1 ? "" : "s"} still to submit for this fund.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <section>
          <h3 className="text-sm font-semibold">Steps</h3>
          <ul className="divide-y">
            <StatusRow
              done={isDone(checks["kyc"])}
              pending={isPending(checks["kyc"])}
              title="Verify your identity"
              detail="Photo ID check through our verification partner."
            />
            <StatusRow
              done={isDone(checks["aml"])}
              pending={isPending(checks["aml"])}
              title="Background screening"
              detail="Source of funds and sanctions questions."
            />
            <StatusRow
              done={isDone(checks["accreditation"])}
              pending={isPending(checks["accreditation"])}
              title={
                offering?.reg_type === "506c"
                  ? "Accreditation with third-party evidence (506(c))"
                  : "Accreditation self-certification (506(b))"
              }
              detail={
                offering?.reg_type === "506c"
                  ? "This fund must verify your accreditation, so a letter from your CPA, attorney, or adviser is required."
                  : "You confirm you qualify; the fund team reviews your answers."
              }
            />
          </ul>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline">
              <Link to="/onboarding/kyc">Identity</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to="/onboarding/accreditation">Accreditation</Link>
            </Button>
          </div>
        </section>

        <section>
          <h3 className="text-sm font-semibold">Documents to upload</h3>
          <ul className="divide-y">
            {needed.map((kind) => {
              const mine = uploads.find((u) => u.docKind === kind);
              return (
                <StatusRow
                  key={kind}
                  done={Boolean(mine) && mine?.reviewStatus === "accepted"}
                  pending={Boolean(mine)}
                  title={KIND_LABEL.get(kind) ?? kind}
                  detail={
                    mine
                      ? `${mine.fileName} — ${mine.reviewStatus === "accepted" ? "accepted" : mine.reviewStatus === "follow_up" ? "the fund team asked for a replacement" : "waiting on review"}`
                      : KIND_HINT[kind]
                  }
                />
              );
            })}
          </ul>
          <Button asChild size="sm" className="mt-2">
            <Link to="/onboarding/documents">Upload documents</Link>
          </Button>
        </section>

        {fundDocs.length ? (
          <section>
            <h3 className="text-sm font-semibold">Fund documents to sign</h3>
            <ul className="divide-y">
              {fundDocs.map((d) => (
                <StatusRow
                  key={d.id}
                  done={d.signed || !d.requiresSignature}
                  title={d.title}
                  detail={d.requiresSignature ? (d.signed ? "Signed" : "Signature required") : "For your records"}
                />
              ))}
            </ul>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button asChild size="sm" variant="outline">
                <Link to="/fund-documents">
                  <FileText className="mr-1 size-4" /> Open fund documents
                </Link>
              </Button>
              {toSign.length ? <Badge variant="secondary">{toSign.length} awaiting signature</Badge> : null}
            </div>
          </section>
        ) : null}
      </CardContent>
    </Card>
  );
}
