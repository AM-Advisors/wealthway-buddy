# Read documents with AI: document type, owner check, and refinements

## 1. Choose what the document is (before reading)
- Each file gets a **What is this?** choice when it is added: W-9/W-8, accreditation proof, government ID, proof of address, entity formation, operating or trust agreement, ownership list, signed subscription agreement, signed side letter, other. Leave it as **Let AI decide** if you're not sure.
- If you pick a type, the AI reads only the details that type can contain. If the AI thinks the file is something else, it says so, for example "This looks like a W-8BEN, not a W-9", and you choose which is right.
- The type stays changeable until the file is saved. After it's saved, changing the type saves a new corrected entry and keeps the original in the history.

## 2. Confirm who it belongs to
- The AI reports the name(s) it finds: the person, the entity or trust, and the signer.
- These are compared with this investment's **investing party** (for example J GIRARDI K GIRARDI REV TRUST), the person behind it, any joint investor, and the entity's signers.
- Result shown on each file:
  - **Matches** (green): the investing party, the person, or a listed signer.
  - **Different name** (amber): you must confirm before saving. Choose **It's this investor**, which records that you confirmed it, or **Belongs to someone else**.
- **Belongs to someone else:** pick another investment in the **same fund** from a searchable list. The file and its suggestions move there, and nothing is saved on the current investor. Other funds are not listed.
- For trusts and entities, you can mark whose document it is within the investment: the entity itself, a signer, or a beneficial owner. For example, an ID belongs to the signer, not the trust.

## 3. Other refinements
1. **One clear next step per file.** Each file shows a short progress line: Read, Type confirmed, Owner confirmed, Details reviewed, Saved, In use. The single next button changes as you go.
2. **Duplicate guard.** If the same file, or one with the same name, type and signed date, is already on the investor, it says "Already saved on [date]" and offers to open it instead of saving it twice.
3. **Expiry and date checks.** IDs and proof of address show an expiry or age warning, for example "Expired March 2026" or "Older than 90 days". Accreditation letters older than 90 days are flagged. These are warnings only, and you can still save.
4. **W-9 and W-8 fit.** The form is checked against the investing party's type and country. For example, a W-9 for a non-US individual is flagged as "W-8BEN expected".
5. **Signed or not.** The AI notes whether a signature and date appear. Unsigned copies are labeled "Unsigned". The tax and subscription buttons can't be used until you confirm it's signed.
6. **Approve all matching.** One button approves every Suggested detail on a file whose owner is confirmed, and then each one is still listed. Details that conflict stay one at a time.
7. **History stays.** After a refresh, the box lists the files read recently for this investor, with their type, owner decision and what was saved. Today the results disappear on refresh.
8. **Same rules on Add investor.** The "Fill in from documents" box on Add investor gets the same type choice and owner check. After the investor is saved, it offers to save those files onto the new record. This answers the earlier open question.

## What stays the same
- Nothing saves or changes without a click. Identity still goes through Verification. Tax ID and account numbers are never read.
- Moving a file to another investor stays inside the same fund. Only Harmonious staff and that fund's managers can use this box.

## Technical section
- `investor-document-save-model.ts`: add type hints per target, `ownerMatch(foundNames, parties)` (normalized name compare, trust and entity aware), `expiryWarnings`, `taxFormFit`, and duplicate keys. Tests for each rule.
- `investor-document-ai.server.ts`: accept an optional `expectedKind`; the AI returns `detectedKind`, `names[]` (role: person, entity, signer), `signed`, `documentDate` and `expiresOn`; redaction stays. Return the comparison against the onboarding's investing party, person, joint investor and signers. Record a `document_read` event with type, owner decision and file hash (no content).
- New server functions: `confirmDocumentOwnerFn` (records the confirmation or move, checks the target is in the same fund and the caller can manage it, re-runs suggestions on the target), `recentDocumentReadsFn` (list from events), and a duplicate check using the file hash on `investor_documents`/`prior_signed_documents`.
- `investor-document-ai.tsx`: type picker before and after reading, owner panel with a searchable same-fund investment picker (SearchableSelect over the fund's authorized roster), progress line, Approve all matching, warnings, and the recent-reads list.
- `create-investor.tsx` / `investor-document-drop.tsx`: the same picker and owner check, plus a post-save "Save these files to the record".
