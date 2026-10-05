# Proposals, RFPs and RFQs for Sales and Marketing

## What you get
A new **Proposals & RFPs** page under Sales, plus a **Sales requests** queue under Marketing.

Three kinds of documents, in two directions:
- **Responses to prospects:** a Proposal, or an answer to an RFP or RFQ that a prospect sent us.
- **Requests to vendors:** an RFP or RFQ that Harmonious sends to a vendor.

## How it works
1. **Start:** a Sales rep picks the type and links it to a deal, a contact or client, and optionally an existing quote. For an incoming RFP or RFQ, the rep uploads the prospect's document (PDF or Word).
2. **AI first draft:** the AI writes a draft from:
   - the deal and the client
   - the quote's services and prices, taken only from the quote and rate card. The AI never makes up prices.
   - Harmonious's standard company details
   - the prospect's questions, if a document was uploaded
   For an incoming RFP, each question from the prospect gets its own answer section. The rep edits every section in the editor.
3. **Ask Marketing for help:** the rep clicks "Request Marketing help" with a note and a due date, and can pick the sections. The request shows in Marketing's queue. A marketer claims it, edits the wording, branding and visuals, then hands it back. Each change records who made it.
4. **Approval:** the rep submits the document. A Sales Manager or the CRO approves it, and it can't be the person who wrote it. Any edit after approval sends it back for approval.
5. **Send:** approved documents can be:
   - downloaded as a branded Harmonious PDF or a Word file
   - emailed to the contact from the rep's own connected inbox, or from the shared address if they haven't connected one. The send is logged on the deal's Outreach history.
6. **Track:** statuses are Draft → With Marketing → Submitted → Approved → Sent → Won / Lost / Declined. For vendor requests the last statuses are Responses received → Awarded. Each document keeps every version.

## Who can do what
- Sales reps create and edit their own documents. Managers see their team's, and leaders see all of them.
- Marketing sees only the documents sent to them for help.
- Only a Sales Manager or the CRO approves. Leadership can view but not change anything.
- Prices in the document always come from the quote. Changing a price means changing the quote, which keeps its existing pricing approvals.

## Technical details
- Migration: `sales_documents` (kind proposal/rfp/rfq, direction response/outbound, deal/contact/client/quote ids, status, owner), `sales_document_versions` (append-only sections JSON), `sales_document_assist_requests` (requester, assignee, note, due, status), `sales_document_events` (append-only audit). Service-role only, reached through server functions with role checks. Uploaded source files go in private storage.
- `src/lib/sales-documents.server.ts` + `.functions.ts`: create, draft with AI (Lovable AI Gateway, `openai/gpt-6-astra`, Responses API, streamed, structured sections; text pulled from uploads using the existing contract-ingestion helpers), save version, request or claim or return Marketing help, submit, approve or reject (approver ≠ author), send (reuses the Gmail/shared send path and logs to `sales_outreach`), status changes.
- Exports: PDF with `pdf-lib` (Harmonious navy/teal, Rubik/Poppins); Word with the `docx` package. Both built on the server from the approved version.
- Routes: `sales_.documents.tsx` (list + new), `sales_.documents_.$id.tsx` (editor, versions, approval, send), `marketing_.assists.tsx` (queue). Sidebar entries under Sales and Marketing.
- Test/demo clients are left out of counts. Add an AGENTS.md rule: sales documents are maker-checker approved, prices come only from quotes, and versions are append-only.
