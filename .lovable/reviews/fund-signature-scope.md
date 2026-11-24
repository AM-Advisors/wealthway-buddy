# Fund-specific agreement check

Rule: a selected fund shows only its own agreements, even when the signed-in person has a signing request on another fund. Unfiltered Signatures remains an authorized cross-fund view.

## Code examined

| Place | Result |
| --- | --- |
| Fund Documents, staff and manager, `documents-tab.tsx` | Passes the exact fund to SignatureCenter, OfferingDocumentsSetup, SigningTracker and file/signing queries. |
| SignatureCenter personal signing card | Fixed: applies the selected fund before finding the viewer's signing requests. |
| SignatureCenter agreement lists, counts and other signed agreements | Fixed: all sections share the same fund-filtered rows, including the fund selector on the cross-fund view. |
| `signature-center.server.ts` fund reader | Fixed: personal fund files, subscription signer requests and not-started subscriptions are no longer returned outside the requested fund. Existing role and signing checks are unchanged. |
| `/signatures` and `/ops/signatures` | Intentionally allow authorized cross-fund reading when no fund is selected. |
| Operations signing requests, `ops-signature-requests.tsx` and `document-signing.functions.ts` | Already filters signer rows by the supplied offering ID before grouping. |
| Fund file list, `fund-tabs.server.ts:listFiles` | Already filters files by offering ID; optional setup evidence follows that fund's setup. |
| SigningTracker and `fund-signing-tracker.functions.ts` | Already uses exact-fund file/signing inputs and fund-filtered logs; log writes verify the file in that fund. |
| `fund-file-signing.functions.ts` signing context and send | Already filters investors, managers and signer rows to the fund; send verifies file and investors against that fund. |
| Fund-file signing page and reminders | Follow the exact signer row, its file and fund; reminders authorize against that row's fund. |
| `investor-document-review.server.ts` reviews, decisions and signed copies | Already scopes document/investment lists to the fund; decisions and downloads reject mismatched funds. |
| `sign-link.functions.ts` email, copy and direct signing-service sends | Already verifies investment and document against the requested fund. |
| `document-signing.server.ts` investor/direct-email signing | Already refuses document/application and onboarding/application fund mismatches. |
| `subscription-packet.server.ts` document collection | Already filters packet documents and fee terms by the selected offering. |
| Background `box-sign-complete.server.ts` | Matches the existing provider request to its signature; advances that application using its fund's required documents. No cross-fund inbox aggregation. |
| Background `fund-countersign-complete.server.ts` | Follows the exact signer row, signature and application; retains normal funding/admission checks. No cross-fund inbox aggregation. |
| Database signature triggers | Read normalize_signer_email and protect_completed_signer definitions. Neither builds a cross-fund list; completed-signature protection unchanged. |
| Database relationships | Read-only checks found zero fund-file/signature, subscription-document/application or signer/application fund mismatches. No data changed. |

## Verification

- 16 focused tests pass, including all three signature sources excluded from Upper90 when they belong to LaaSy, preserved on LaaSy and in the all-fund reader.
- Real SignatureCenter exercised in fictional QA: unfiltered personal request visible; selecting another fund removes it and updates counts; selecting its original fund restores it.
- Browser reported no page errors and no real backend/server-function requests during fictional QA. Screenshots inspected.
- Preview build log reports build OK.
- Real Upper90/Alyssa signed-in session not exercised. Nothing sent, signed, canceled, reassigned or published; permissions and settled records unchanged.