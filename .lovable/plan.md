# Fix "Configure the Foundation Administration component first" on quotes

## What's happening
The six Foundation Administration services were added to the "Add a service from the rate card" list. Picking one there adds a plain line with no foundation details (which foundation, service dates, billing start). When you save, the system refuses it and shows this error. The working path is the separate "Configure Foundation Administration" button, which collects those details.

## Fix (small, about one round of work)
1. Take the Foundation Administration services out of the plain rate card list so the broken path can't be used.
2. If someone picks one anyway (or an older draft already has one), open the Foundation setup box with that service pre-chosen instead of adding a broken line.
3. Any existing draft line missing its details shows "Finish setup" on that line, and saving explains what is missing in plain words instead of the generic error.
4. If the client has no foundation on file yet, the setup box keeps its message and adds a direct link to the client's Foundation tab to set one up, then come back.

Unchanged: foundation pricing still needs CEO or CRO approval, and quotes still can't be sent until Foundation Administration is released.

## Technical details
- src/routes/_authenticated/sales_.quotes.tsx: filter `isFoundationKey` keys from the rate card Select; route selection to `setShowFoundation(true)` with an initial component; flag unconfigured foundation lines.
- src/components/sales/foundation-configurator.tsx: accept `initialComponent`; link to client Foundation tab when none on file.
- src/lib/sales-quotes.server.ts: clearer error naming the line label.
- Add a test that a foundation key without configuration is rejected with the line name, and that the rate card list excludes foundation keys.
