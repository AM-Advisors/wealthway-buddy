# Turn on Box signing with your real Box account

The signing code is already built and waiting on credentials. Once your Box values are saved, investors sign inside the portal, and the signed copy comes back with a completion timestamp on both the investor dashboard and the fund manager review page.

## What you need to do in Box

1. Go to the Box Developer Console and open (or create) a **Custom App**.
   - Authentication method: **Server Authentication (Client Credentials Grant)**.
2. In the app's **Configuration** tab, turn on:
   - App Access Level: **App + Enterprise Access**
   - Application Scopes: Read all files, Write all files, **Manage Signature Requests** (Box Sign)
   - Then click **Save Changes**.
3. In the **Authorization** tab, click **Review and Submit**. A Box admin must approve the app in the Box Admin Console (Apps, Custom Apps Manager) before it will work.
4. Copy these three values:
   - **Client ID** and **Client Secret** (Configuration tab)
   - **Enterprise ID** (General Settings tab)
5. In Box, create a folder for signed fund documents (e.g. "Harmonious - Signed Fund Documents"), open it, and copy the number at the end of its URL — that's the **Folder ID**.
6. Share that folder with the app's service account (the address shown on the app's General Settings page) as Editor, so uploads land there.

## What I do next

1. Open a secure form for: Client ID, Client Secret, Enterprise ID, Folder ID. Values go straight to encrypted storage.
2. Run a live check against Box: confirm the token works, upload a test PDF into your folder, then delete it.
3. Register the Box Sign webhook so completed signatures come back automatically, and save its signature keys.
4. Run one end-to-end test: send a fund document out for signature on a test application, complete it, and confirm the signed PDF, the signer name, and the completion timestamp appear in the investor portal and in the fund manager's review page.
5. Report back with what was seen, or the exact Box error if a permission is still missing.

## Notes

- Signed PDFs are stored in Box and mirrored into the app's own secure storage, so the portal keeps working even if Box access changes later.
- Until the credentials are in, the portal falls back to the existing in-app signing, so nothing breaks in the meantime.

## Technical detail

- Secrets: `BOX_CLIENT_ID`, `BOX_CLIENT_SECRET`, `BOX_ENTERPRISE_ID`, `BOX_FOLDER_ID`, plus `BOX_WEBHOOK_PRIMARY_KEY` / `BOX_WEBHOOK_SECONDARY_KEY` after webhook creation.
- Webhook URL to register in Box (triggers: `SIGN_REQUEST.COMPLETED`, `SIGN_REQUEST.DECLINED`, `SIGN_REQUEST.EXPIRED`, `SIGN_REQUEST.SIGNER_EMAIL_BOUNCED`):
  `https://onboard.harmonious.co/api/public/webhooks/box-sign`
- Existing code paths: `src/lib/box.server.ts`, `src/lib/box-sign.functions.ts`, `src/lib/box-sign-complete.server.ts`, `src/routes/api/public/webhooks/box-sign.ts`.
- `getSigningProvider` flips the portal to Box Sign automatically once the three core credentials exist; no code change needed to switch over.
