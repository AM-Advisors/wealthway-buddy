/**
 * "Adding an investor" guide for fund managers. Single source for the help
 * center article and the printable PDF (scripts/add-investor-guide). Labels
 * quote the real on-screen text of the fund Investors page, the Add investor
 * form and the investor record; keep them in step with those screens.
 */
import { SUPPORT_EMAIL } from "@/lib/sign-in-guide-content";

export type AddInvestorMock =
  | "investors-page"
  | "add-chooser"
  | "investor-form"
  | "search-results"
  | "amount"
  | "add-and-invite"
  | "investor-steps"
  | "roster-row"
  | "fill-in"
  | "approve-funds";

export type AddInvestorStep = { title: string; paragraphs: string[]; labels: string[]; mock?: AddInvestorMock };
export type AddInvestorOption = { title: string; body: string; labels: string[] };
export type AddInvestorQuestion = { q: string; a: string[] };

export type AddInvestorGuide = {
  eyebrow: string;
  title: string;
  intro: string;
  where: string;
  before: string[];
  steps: AddInvestorStep[];
  after: AddInvestorStep[];
  otherWays: AddInvestorOption[];
  questions: AddInvestorQuestion[];
  help: string[];
};

export const ADD_INVESTOR_GUIDE: AddInvestorGuide = {
  eyebrow: "Fund manager guide",
  title: "Adding an investor to your fund",
  intro: "Add an investor in about two minutes. You enter who they are, Harmonious emails them a personal invitation, and they complete their own verification and signing. You can follow every step from your Investors list.",
  where: "My Funds › your fund › Investors",
  before: [
    "The investor's legal name, as it appears on their government ID.",
    "The email address they will sign in with. Their invitation goes there.",
    "How they are investing: in their own name, jointly, or through a trust, IRA or company.",
    "The investment amount, if you know it. You can add it later.",
  ],
  steps: [
    {
      title: "Open your fund's Investors page",
      paragraphs: [
        "Sign in at app.harmonious.co/client-login. In the menu, select My Funds, then select the fund.",
        "Open the Investors tab. It lists everyone investing in the fund and who each next step is waiting on.",
      ],
      labels: ["My Funds", "Investors"],
      mock: "investors-page",
    },
    {
      title: "Select Add investor",
      paragraphs: [
        "Select Add investor at the top of the page. A window opens with the ways you can add people.",
        "Choose Add one investor. The other choices are explained below, under Other ways to add investors.",
      ],
      labels: ["Add investor", "Add investors", "Add one investor"],
      mock: "add-chooser",
    },
    {
      title: "Enter who is investing",
      paragraphs: [
        "Choose Individual for a person, or Business / organization for a fund, LLC, corporation, partnership or family office.",
        "For a person, enter Legal first name, Last name and Email. For a business, enter the contact person's name and email and the Legal business / entity name; the business completes its own verification.",
        "If a spouse, assistant or advisor handles the paperwork, tick Someone else completes the paperwork and gets the invitation and enter their details. The investor's legal name stays on the agreements, and the investor still signs.",
      ],
      labels: ["Individual", "Business / organization", "Legal first name", "Last name", "Email"],
      mock: "investor-form",
    },
    {
      title: "Check for an existing record",
      paragraphs: [
        "Select Search existing investors so nobody is entered twice.",
        "If you see No existing investor matches, carry on. If you see Possible existing investors, pick the right one. The Use button showing their profile name adds that same profile. Use person, new profile keeps the person but lets them invest another way, such as through their trust.",
        "If it is a different person who shares the name or email, tick Create new: this is a different person.",
      ],
      labels: ["Search existing investors", "Possible existing investors", "Use person, new profile", "Create new: this is a different person"],
      mock: "search-results",
    },
    {
      title: "Choose how they invest and the amount",
      paragraphs: [
        "Under Investing as, choose Individual, Joint, Business / organization, Trust or IRA / Retirement. For a trust or business, enter its legal name.",
        "Enter the Investment amount (USD) if you know it. You can add it later, but it is needed before their agreements are prepared.",
        "Have more details? Select Enter Full Investor Details to add a phone number, address, tax ID, owners and signers or notes. All of it is optional, and the investor is asked to confirm what you enter. Tax IDs are stored encrypted and only the last 4 digits are ever shown.",
      ],
      labels: ["Investing as", "Investment amount (USD)", "Enter Full Investor Details"],
      mock: "amount",
    },
    {
      title: "Add and invite",
      paragraphs: [
        "Select Add & invite. To go straight to the investor's page afterward, select Add & invite · Open record instead.",
        "You'll see Investor added and invitation sent, and the investor appears on your list.",
        "The investor gets an email titled Complete your investment onboarding for your fund, with a Complete Onboarding button. Their personal link lasts 30 days.",
      ],
      labels: ["Add & invite", "Add & invite · Open record", "Investor added and invitation sent."],
      mock: "add-and-invite",
    },
  ],
  after: [
    {
      title: "The investor completes their steps",
      paragraphs: [
        "The investor signs in with the invited email and completes four steps in order: About You, Verification, Sign and Fund.",
        "They verify their own identity, confirm their own answers and sign their own documents. Nobody can do these for them.",
      ],
      labels: ["About You", "Verification", "Sign", "Fund"],
      mock: "investor-steps",
    },
    {
      title: "Follow progress on your Investors list",
      paragraphs: [
        "Each row shows one status, how many steps are done, such as Done 3 of 6, and who the next step is waiting on.",
        "Select Waiting on investor, Waiting on Harmonious or Ready or funded at the top to filter the list. Select a name to see everything about that investor.",
      ],
      labels: ["Waiting on investor", "Waiting on Harmonious", "Ready or funded"],
      mock: "roster-row",
    },
    {
      title: "Fill in answers you already know (optional)",
      paragraphs: [
        "Select Fill in for investor on their row to enter answers you already have. Select Save and send to sign to send them to the investor to check and sign, or Save only to keep them for later.",
        "Once the investor confirms their answers, only they can change them.",
      ],
      labels: ["Fill in for investor", "Save and send to sign", "Save only"],
      mock: "fill-in",
    },
    {
      title: "Approve them to send funds",
      paragraphs: [
        "After the investor signs, open their record. When you see Approve investor to send funds, check the details, select Approve to send funds and confirm.",
        "The investor can then see the fund's released bank details and send their money. Adding or approving an investor never signs for them or confirms that money arrived.",
      ],
      labels: ["Approve investor to send funds", "Approve to send funds"],
      mock: "approve-funds",
    },
  ],
  otherWays: [
    {
      title: "Upload a list",
      body: "Add many investors at once from an Excel file, a CSV file or a Google Sheets link. Select Download template for the right columns, then Preview. Nothing is saved until you select Confirm & Add. People added from a list are not emailed; when you're ready, select the three dots next to each name and choose Invite investor.",
      labels: ["Upload a list", "Download template", "Preview", "Confirm & Add", "Invite investor"],
    },
    {
      title: "Invite several by email",
      body: "Paste one investor per line as name, email, amount and type. Select Review investors to check them, then send the invitations.",
      labels: ["Invite several by email", "Review investors"],
    },
    {
      title: "Prepare a draft",
      body: "Fill in an investor's details and choose their documents before they are invited. Select Save Draft to come back later, or Review before sending and then Send Onboarding.",
      labels: ["Prepare a draft", "Save Draft", "Review before sending", "Send Onboarding"],
    },
    {
      title: "Share the fund link",
      body: "Select Copy link next to Add investor and share it with investors. They sign up themselves and appear on your list.",
      labels: ["Share the fund link", "Copy link"],
    },
  ],
  questions: [
    {
      q: "It says an investor with this email already exists, or an existing investor may be this person",
      a: [
        "Harmonious found a record that may be the same person. Select Search existing investors and choose the matching record.",
        "If it really is someone else, tick Create new: this is a different person and save again.",
      ],
    },
    {
      q: "It says this investing profile is already in this Fund",
      a: [
        "That investor is already on your list, so search the list instead of adding them again. To add a second investment through a different trust or company, choose Use person, new profile.",
      ],
    },
    {
      q: "It says the investor was added, but the invitation was not sent",
      a: [
        "The investor is saved, so don't add them again. Open their record and select Send invite or Resend invite on the Investor invitation card. Check status shows whether they have accepted.",
      ],
    },
    {
      q: "The investor can't find their invitation",
      a: [
        "Ask them to check their spam or junk folder for an email from Harmonious, and to use the exact address you entered.",
        "On your Investors list, select Resend invitation next to their name. You can also open their record and select Copy investor link to send the link yourself.",
      ],
    },
    {
      q: "Their invitation link has expired",
      a: [
        `Personal links last 30 days. If you see This link has expired, email ${SUPPORT_EMAIL} and Harmonious will replace it.`,
      ],
    },
    {
      q: "I entered the wrong name, email or amount",
      a: [
        "Select the three dots next to the investor, then Edit investor details or Edit investment. You can change details directly until the investor signs or sends money; later changes go to review.",
        "If the investor has already signed in, the option is Suggest detail changes, and the investor confirms the change.",
      ],
    },
    {
      q: "I added someone by mistake",
      a: [
        "Select the three dots next to their name, then Remove from Fund, and confirm. Their record, other funds and history are kept.",
      ],
    },
    {
      q: "Can I verify or sign for the investor?",
      a: [
        "No. Each investor verifies their own identity and signs their own documents. You can fill in answers for them to check, and someone else can handle the paperwork, but the investor still signs.",
      ],
    },
  ],
  help: [
    `Email ${SUPPORT_EMAIL}, or use Messages in your portal to contact Harmonious.`,
    "Investors with questions about the investment itself, such as amounts, terms or documents, should contact you.",
  ],
};

export const ADD_INVESTOR_GUIDE_DOWNLOAD = {
  href: "/downloads/Harmonious-Add-an-Investor-Guide.pdf",
  filename: "Harmonious-Add-an-Investor-Guide.pdf",
};
