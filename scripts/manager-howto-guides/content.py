"""Content for two standalone fund manager guides, rendered with scripts/add-investor-guide/make_pdf.py.
Run: python3 scripts/manager-howto-guides/content.py && python3 scripts/add-investor-guide/make_pdf.py /tmp/mhg/content.json
Labels quote the live screens (manager-fund-investors.tsx, fund-onboarding-link.tsx, prior-signed-documents.tsx, upload-for-investor.tsx)."""
import json, os

LINK = {
  "eyebrow": "Fund manager guide",
  "title": "Sharing your onboarding link",
  "intro": "Every launched fund has one onboarding link. Anyone you send it to can sign up and start investing in your fund on their own. This guide shows where to find the link, how to share it, and how to turn it off or replace it.",
  "where": "My Funds  ›  your fund  ›  Investors",
  "before": [
    "Your fund has been launched. The link is created at launch.",
    "You are signed in with your fund manager account.",
    "The email addresses of the investors you want to invite.",
  ],
  "groups": [
    {"heading": "Copy the link", "steps": [
      {"title": "Open your fund", "paragraphs": ["Sign in and select My Funds in the menu, then select the fund."], "labels": ["My Funds"]},
      {"title": "Go to the Investors tab", "paragraphs": ["This page lists everyone investing in the fund."], "labels": ["Investors"]},
      {"title": "Select Copy link", "paragraphs": ["The button is at the top of the page, next to Add investor. You will see the message \"Onboarding link copied.\" Paste it into your own email or message to investors.", "You can also select Add investor, then Share the fund link. It copies the same link."], "labels": ["Copy link", "Onboarding link copied", "Share the fund link"]},
    ]},
    {"heading": "See the link and a ready-made message", "steps": [
      {"title": "Open the link settings", "paragraphs": ["On the Investors tab, scroll below the investor list and open the section called More for this fund."], "labels": ["More for this fund: link, settings and reports"]},
      {"title": "Use the Investor Onboarding Link card", "paragraphs": ["The card shows the full link and whether it is Active. It also shows when it was created and last used.", "Copy Invitation Message copies a short invitation that already includes the link. Preview Investor Experience opens the link so you can see what investors see."], "labels": ["Investor Onboarding Link", "Copy Link", "Copy Invitation Message", "Preview Investor Experience"]},
    ]},
    {"heading": "Turn the link off or replace it", "steps": [
      {"title": "Pause new sign-ups", "paragraphs": ["Select Turn off link. Anyone who opens it is told it isn't active. Select Turn on link to open it again."], "labels": ["Turn off link", "Turn on link"]},
      {"title": "Replace the link", "paragraphs": ["Select Regenerate Link and confirm. The old link stops working right away, so send the new one to anyone who still needs it."], "labels": ["Regenerate Link"]},
      {"title": "Nothing is lost", "paragraphs": ["Turning the link off or replacing it never removes investors. Anyone who already started keeps their progress."], "labels": []},
    ]},
  ],
  "cards": {"heading": "Fund link or personal invitation?", "intro": "Both get investors started. Choose the one that fits.", "items": [
    {"title": "Fund onboarding link", "body": "One link for the whole fund. Good for sharing with many people at once. Each investor enters their own details when they sign up.", "labels": ["Copy link"]},
    {"title": "Personal invitation", "body": "You enter the investor's name and email first, and we email them their own link. Use this when you want them listed on your Investors page before they sign up. Personal links expire after 30 days.", "labels": ["Add investor", "Add one investor"]},
  ]},
  "questions": [
    {"q": "Copy link says there is no active onboarding link yet", "a": ["Open More for this fund below the investor list. If the card says the link is turned off, select Turn on link. If it says no link has been set up, select Create Link.", "If you don't see these buttons, the fund may not be launched yet. Finish the launch steps on the fund's home page first."]},
    {"q": "An investor says the link doesn't work", "a": ["Check that the card shows Active. If you regenerated the link, they may have the old one. Send them the current link."]},
    {"q": "I sent the link to the wrong person", "a": ["Select Regenerate Link so the old link stops working, then send the new link to the right people. If the wrong person already started, you can remove them from the fund from the Investors tab."]},
    {"q": "Can investors forward the link to someone else?", "a": ["Yes. Anyone with the link can start. Every investor still verifies their identity, and you approve each investor before they are admitted."]},
  ],
  "help": ["Email the Harmonious team and tell us the fund name and what you see on screen. Please don't email passwords or security codes."],
}

PAPER = {
  "eyebrow": "Fund manager guide",
  "title": "When an investor signs on paper",
  "intro": "Some investors prefer to sign their documents outside the platform, by hand or in their own signing tool. This guide shows how to get the documents, collect the signed copies and record them so the investor's Sign step is completed.",
  "where": "My Funds  ›  your fund  ›  Investors",
  "before": [
    "The investor is already added to your fund. If not, select Add investor on the Investors tab first.",
    "Your fund documents are approved and current.",
    "The investor's investment amount is correct on the platform. The paper copy must match it.",
  ],
  "groups": [
    {"heading": "Get the documents", "steps": [
      {"title": "Open your fund's Documents tab", "paragraphs": ["Select My Funds, then the fund, then Documents."], "labels": ["My Funds", "Documents"]},
      {"title": "Download each document", "paragraphs": ["For a Harmonious template, select Review, then Download. For a file your fund attached, open the file and save it.", "The documents already include the fund's details. The investor fills in their own name, amount and signature by hand."], "labels": ["Review", "Download"]},
      {"title": "Send them to the investor", "paragraphs": ["Email the documents yourself. Tell the investor to sign every signature page, and to return the W-9 (or W-8 if they are not a U.S. person) too."], "labels": []},
    ]},
    {"heading": "Record the signed Subscription Agreement", "steps": [
      {"title": "Check the signed copy", "paragraphs": ["Make sure every page is signed and the investor's name and amount match what is on the platform. If anything differs, correct it on the platform first, or ask the investor to sign again."], "labels": []},
      {"title": "Open the investor", "paragraphs": ["On the Investors tab, select the investor's name. In Status, review & actions, open the Documents tab."], "labels": ["Status, review & actions", "Documents"]},
      {"title": "Mark it as signed", "paragraphs": ["Select Mark as signed outside the platform, enter the date it was signed, then select Confirm."], "labels": ["Mark as signed outside the platform", "Confirm"]},
      {"title": "Upload your copy and send one to Harmonious", "paragraphs": ["Under Signed before joining Harmonious, select Load a completed document. Choose Subscription Agreement, enter the date signed, choose the file and select Save document.", "Then email the signed copy to Harmonious. The Sign step is completed once Harmonious loads its copy. Until then the page says it is waiting for Harmonious."], "labels": ["Load a completed document", "Save document"]},
    ]},
    {"heading": "Record the signed tax form", "steps": [
      {"title": "Upload the W-9 or W-8", "paragraphs": ["On the investor's page, open the Documents tab at the top. Under Investor documents & tax forms, choose the tax form type, choose the file and select Upload."], "labels": ["Investor documents & tax forms", "Upload"]},
      {"title": "Mark it completed", "paragraphs": ["On the uploaded form, select Mark completed outside platform and confirm. It now counts as the investor's completed tax form."], "labels": ["Mark completed outside platform"]},
    ]},
    {"heading": "Approve the investor", "steps": [
      {"title": "Finish as usual", "paragraphs": ["When the investor's other steps are done, approve them the same way as any other investor. Signing on paper does not mark anything as funded. Money is only recorded when it actually arrives."], "labels": ["Approve to send funds"]},
    ]},
  ],
  "cards": {"heading": "What still happens on the platform", "intro": "Paper signing replaces only the signing itself.", "items": [
    {"title": "Investor details and identity check", "body": "The investor still enters their details and verifies their identity on the platform. These can't be done on paper.", "labels": []},
    {"title": "Subscription Agreement", "body": "Can be signed on paper. Counts once you mark it and Harmonious loads the signed copy.", "labels": ["Mark as signed outside the platform"]},
    {"title": "Tax form", "body": "Can be signed on paper. Counts once you upload it and mark it completed.", "labels": ["Mark completed outside platform"]},
    {"title": "Your approval", "body": "You still approve the investor before they are admitted and before they send money.", "labels": ["Approve to send funds"]},
  ]},
  "questions": [
    {"q": "I don't see Mark as signed outside the platform", "a": ["The investor may have already signed on the platform. In that case there's nothing to sign on paper. Check the Documents tab for their signed copy."]},
    {"q": "I marked it by mistake", "a": ["Select Undo, give a short reason and select Confirm undo. Both entries stay in the investor's history."]},
    {"q": "The amount on the paper copy is different", "a": ["Don't mark it as signed. Correct the investment amount on the platform first, then ask the investor to sign a copy with the right amount."]},
    {"q": "It still says it's waiting for Harmonious", "a": ["Harmonious hasn't loaded the signed copy yet. Email it to us with the investor and fund name."]},
    {"q": "The investor signed an older version", "a": ["Ask them to sign the current version from your Documents tab. Only the current version can be recorded."]},
  ],
  "help": ["Email the Harmonious team with the investor and fund name and what you see on screen. Send signed documents only by the method we agreed with you."],
}

os.makedirs("/tmp/mhg", exist_ok=True)
json.dump({"support": "support@harmonious.co", "guides": {"link": LINK, "paper": PAPER},
  "outputs": [["link", "Harmonious-Sharing-Your-Onboarding-Link.pdf", "Sharing your onboarding link"],
              ["paper", "Harmonious-Investor-Signs-on-Paper.pdf", "When an investor signs on paper"]]},
  open("/tmp/mhg/content.json", "w"), indent=1)
