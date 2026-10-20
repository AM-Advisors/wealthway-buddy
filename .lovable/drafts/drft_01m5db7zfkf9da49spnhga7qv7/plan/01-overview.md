# Fix the Box "trouble processing your document" error and add Try again

## What changes for people
- Each new signing request gets its own fresh file in Box. A re-send never stacks the new agreement on top of an earlier file.
- When Box can't prepare a document, the investor no longer sees Box's error messages. They see "Box couldn't prepare this document" with a **Try again** button.
- Try again sends a brand-new request built from the current document.
- Operations sees the failure as **Failed** rather than "Cancelled", with a **Retry** action on Signature requests.
- Signed requests and requests still out for signature are never retried.

## Rules for Try again
- Only failed requests can be retried. That means Box ended them with an error such as a conversion failure. Expired, declined and staff-cancelled requests are not failed.
- A person must press the button: the investor on their own agreement, or Harmonious staff. The app never re-sends on its own, so no surprise emails go to named signers.
- Retries are limited to 3 per document per investment in 24 hours. After that the message says to contact Harmonious.
- Every failure and retry is recorded in the document's history, with who pressed it.

## Can Box convert Word files?
Yes. Box Sign turns Word files into a PDF itself when a request is sent. Its documentation says a conversion error needs a brand-new request; the same request can't be retried. That affects what Try again can and can't fix:
- **Problem on our side.** If the error came from the same file being reused with the wrong label, a new request with a fresh, correctly labeled file should work. That is the main fix here.
- **Problem in the file itself.** If the Word file is damaged or uses something Box can't read, retrying won't help.

So retrying only goes so far:
- If the same document fails conversion twice in a row, Try again is hidden.
- The investor is told Harmonious is fixing the document, and staff get a "Document needs a new upload" flag on that fund document.
- Staff can still retry after they upload a corrected file.
