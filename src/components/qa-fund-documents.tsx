import { FundTypeDocumentsCard } from "./fund-tabs/fund-type-documents-card";
import { TemplateDocumentsCard } from "./fund-tabs/template-documents-card";
import { QA_FUND_ID } from "@/lib/qa-sandbox/fictional-data";

export function QaFundDocuments() {
  return <section className="space-y-4" aria-label="Fictional fund documents"><FundTypeDocumentsCard fundId={QA_FUND_ID} /><TemplateDocumentsCard fundId={QA_FUND_ID} /></section>;
}