/** Shared printed guidance only; never grants access or records completion. */
export const HELPER_INSTRUCTIONS = {
  title: "Add a paperwork helper",
  intro: "Invite an assistant, spouse, advisor or family office colleague to help with an investment. The investing party stays the same, and the authorized signer still reviews and signs.",
  steps: [
    { title: "1. Open the investment", text: "Fund managers: open your fund, choose Investors, then open the investor's record. Go to Verification & actions and find Completed by. Investors: if this control isn't on your screen, ask your fund manager to add the helper to this investment." },
    { title: "2. Choose paperwork access", text: "Select Assign someone to complete, then Prepares details. Do not choose Signs for someone who only helps with paperwork. A point of contact may be view only and is not a substitute for a preparer." },
    { title: "3. Enter the helper's details", text: "Enter their Full name and their own Email. Add a Title if useful, such as Assistant or Advisor. Keep the investor's name and email on the investor's record; do not replace them with the helper's details." },
    { title: "4. Send their invitation", text: "Select Assign and email. Check that the assignment and email succeeded. The helper opens the Harmonious email link and signs in or creates an account using that exact email address. Never share a login or security code." },
    { title: "5. Complete, then review and sign", text: "The helper enters missing details and uploads the requested documents. Keep trust or company details separate from each trustee, owner and signer. The investor or authorized signer checks every answer, confirms the required statements and signs. Follow About You, Verification, Sign, then Fund." },
    { title: "6. Check progress or end access", text: "Return to Completed by to check who prepares and who signs. More than one preparer can help. To end a helper's access, select Remove beside their name; their recorded history is kept." },
  ],
  boundaries: [
    { title: "Paperwork access only", text: "Adding a preparer does not grant signing authority, fund management or money access. They cannot sign as you, approve funding, change the investment amount or move money. Identity and eligibility checks must still pass through the approved verification process." },
    { title: "Keep sensitive information secure", text: "Use the secure portal for SSNs, EINs, ID documents and other private details, not ordinary email. A helper invitation applies only to the selected investment. Already-sent money does not excuse missing paperwork or signatures." },
  ],
  help: "No invitation or still view only? Confirm the email and Prepares details assignment with your fund manager. If the email failed, ask them to check delivery. Questions: support@harmonious.co.",
} as const;