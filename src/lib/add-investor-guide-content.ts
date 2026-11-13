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
  | "approve-funds"
  | "entity-form"
  | "entity-details"
  | "completed-by"
  | "people-panel"
  | "contacts-panel";

export type AddInvestorStep = { title: string; paragraphs: string[]; labels: string[]; mock?: AddInvestorMock };
export type AddInvestorOption = { title: string; body: string; labels: string[] };
export type AddInvestorQuestion = { q: string; a: string[] };

export type AddInvestorGuide = {
  eyebrow: string;
  title: string;
  intro: string;
  where: string;
  before: string[];
  /** Numbered step groups, in order. Numbering restarts in each group. */
  groups: { heading: string; steps: AddInvestorStep[] }[];
  cards: { heading: string; intro: string; items: AddInvestorOption[] };
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
  groups: [
    { heading: "Add one investor", steps: [
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
    ] },
    { heading: "What happens next", steps: [
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
    ] },
  ],
  cards: { heading: "Other ways to add investors", intro: "All of these are in the same Add investors window.", items: [
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
  ] },
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

/**
 * Same guide for a fund, family office or other business whose team needs
 * access. Quotes the investor record's Completed by and People on this
 * investment panels; each extra person gets a separate, limited role.
 */
export const ADD_ENTITY_INVESTOR_GUIDE: AddInvestorGuide = {
  eyebrow: "Fund manager guide",
  title: "Adding a fund or family office",
  intro: "When a fund, family office or company invests, several of its people usually need to be involved. You add the business once, then give each person their own access: someone to fill in the details, the person who signs, the owners who verify their identity and colleagues who only need to follow along.",
  where: "My Funds › your fund › Investors",
  before: [
    "The business's legal name, its type (for example family office, LLC or partnership) and its EIN, if you have it.",
    "One main contact: their name and the email they will sign in with. The invitation goes to them.",
    "The name, email and title of everyone else who needs access, and what each person should do.",
    "The investment amount, if you know it. You can add it later.",
  ],
  groups: [
    { heading: "Add the business", steps: [
      {
        title: "Open Add investor",
        paragraphs: [
          "Sign in, select My Funds, select the fund and open the Investors tab.",
          "Select Add investor, then choose Add one investor.",
        ],
        labels: ["My Funds", "Investors", "Add investor", "Add one investor"],
        mock: "add-chooser",
      },
      {
        title: "Choose Business / organization and enter the main contact",
        paragraphs: [
          "Select Business / organization at the top of the form.",
          "Enter Contact first name, Contact last name and Contact email for the person who will lead the investment, then the Legal business / entity name.",
          "The main contact gets the invitation and uses their own login. The business, not the contact, is the investor on every agreement.",
        ],
        labels: ["Business / organization", "Contact first name", "Contact last name", "Contact email", "Legal business / entity name"],
        mock: "entity-form",
      },
      {
        title: "Add the business details",
        paragraphs: [
          "Select Search existing investors first, so the business isn't entered twice.",
          "Enter the Investment amount (USD) if you know it. Then select Enter Full Investor Details and open Investment Profile to choose the Entity type, such as Family office, LLC or Partnership, and add the Jurisdiction and EIN / Tax ID if you have them.",
          "Everything here is optional. The main contact is asked to confirm it.",
        ],
        labels: ["Search existing investors", "Investment amount (USD)", "Enter Full Investor Details", "Investment Profile", "Entity type"],
        mock: "entity-details",
      },
      {
        title: "Add and open the investor's page",
        paragraphs: [
          "Select Add & invite · Open record. The main contact is emailed their invitation, and the investor's page opens.",
          "On that page, open Verification & actions. The next steps all happen there.",
        ],
        labels: ["Add & invite · Open record", "Verification & actions"],
        mock: "add-and-invite",
      },
    ] },
    { heading: "Give the team access", steps: [
      {
        title: "Assign someone to fill in the details (optional)",
        paragraphs: [
          "Under Completed by, select Assign someone to complete, choose Prepares details and enter their Full name, Email and Title, such as Analyst or Family office CFO. Select Assign and email.",
          "A preparer can enter details, owners and signers, and upload documents. They can't pass identity checks, sign or send money. You can assign more than one.",
        ],
        labels: ["Completed by", "Assign someone to complete", "Prepares details", "Assign and email"],
        mock: "completed-by",
      },
      {
        title: "Name the person who signs",
        paragraphs: [
          "In the same Completed by panel, select Assign someone to complete, choose Signs and enter the signer's details. Select Assign and email.",
          "Each investment has one signer. They review the details and sign the subscription documents for the business. If you name nobody, the main contact signs.",
        ],
        labels: ["Signs", "Assign and email"],
        mock: "completed-by",
      },
      {
        title: "Add owners and people who control the business",
        paragraphs: [
          "Under People on this investment, select Add another person (identity check & signature). Enter their First name, Last name, Email, Role (for example Beneficial owner, Control person, Manager or Authorized signer), Title and Ownership %.",
          "Leave Email them an identity check (ID + selfie) ticked so they verify themselves. To make this person the signer, tick Make them the signer and send them the signature page. Select Add person.",
          "Add the people the business verification asks for. Each one completes their own identity check.",
        ],
        labels: ["People on this investment", "Add another person (identity check & signature)", "Email them an identity check (ID + selfie)", "Add person"],
        mock: "people-panel",
      },
      {
        title: "Add colleagues who only need to follow along",
        paragraphs: [
          "Under Points of contact, select Add point of contact, enter their Full name, Email and Title, then select Add and email view link.",
          "Points of contact sign in and see the investment and its progress. Their access is view only. You can add up to 10.",
        ],
        labels: ["Points of contact", "Add point of contact", "Add and email view link"],
        mock: "contacts-panel",
      },
    ] },
    { heading: "What happens next", steps: [
      {
        title: "Everyone signs in with their own email",
        paragraphs: [
          "Each person gets their own email from Harmonious and signs in with the exact address you entered. Nobody shares a login.",
          "The main contact completes About You, Verification, Sign and Fund. For a business, Verification includes the entity documents, the owners and signers, and the entity W-9.",
        ],
        labels: ["About You", "Verification", "Sign", "Fund"],
        mock: "investor-steps",
      },
      {
        title: "Follow progress and approve",
        paragraphs: [
          "The Investors list shows what the business is waiting on. Open the investor's page to see each person's status.",
          "After the signer signs, select Approve to send funds and confirm. The business can then see the fund's released bank details and send its money.",
        ],
        labels: ["Approve investor to send funds", "Approve to send funds"],
        mock: "approve-funds",
      },
    ] },
  ],
  cards: { heading: "Who can do what", intro: "Each person only gets the access their role needs. Every change is recorded.", items: [
    {
      title: "Main contact",
      body: "Gets the invitation and completes the investment for the business: details, verification, documents and funding. Signs too, unless you name a separate signer.",
      labels: ["Contact email"],
    },
    {
      title: "Preparer",
      body: "Fills in details, owners and signers, and uploads documents. Can't pass identity checks, sign, change the amount or send money.",
      labels: ["Prepares details"],
    },
    {
      title: "Signer",
      body: "Reviews the details and signs the subscription documents for the business. One signer per investment.",
      labels: ["Signs", "Make them the signer and send them the signature page"],
    },
    {
      title: "Owners and control persons",
      body: "Complete their own identity check with a photo ID and selfie. Nobody can do this for them.",
      labels: ["Email them an identity check (ID + selfie)"],
    },
    {
      title: "Point of contact",
      body: "Signs in to see the investment and its progress. View only: can't enter details, sign or send money.",
      labels: ["Point of contact (view only)"],
    },
  ] },
  questions: [
    {
      q: "Can everyone have the same full access as the main contact?",
      a: [
        "Each investment has one main contact. Everyone else gets one of the roles above, so it's always clear who entered the details, who verified and who signed.",
      ],
    },
    {
      q: "It says extra points of contact are for joint accounts, entities and trusts",
      a: [
        "The investor was added as an individual. On the investor's page, select Change to joint, entity or trust, choose Entity and enter the legal name, then add the people again. This works only before signing or funding starts.",
      ],
    },
    {
      q: "It says to remove the current signer before naming a new one",
      a: [
        "An investment has one signer. Select Remove next to the current signer, then name the new one.",
      ],
    },
    {
      q: "Someone can't see the investment",
      a: [
        "They must sign in with the exact email you entered. If they see a message asking them to sign in as a different address, they're using another login.",
        "Check their email on the investor's page. If it's wrong, remove them and add them again with the right address.",
      ],
    },
    {
      q: "It says a person was added but Harmonious will confirm it isn't a duplicate",
      a: [
        "Harmonious found someone similar already on file. Their identity check is sent once Harmonious confirms who they are. You don't need to add them again.",
      ],
    },
    {
      q: "Someone left the business or shouldn't have access anymore",
      a: [
        "Select Remove next to their name. You'll see Access ended. Their history is kept.",
      ],
    },
    {
      q: "The same people invest in another of my funds",
      a: [
        "Access is set for each investment. Add the business to the other fund and give the team access there too. Search existing investors finds the business so it isn't entered twice.",
      ],
    },
    {
      q: "Can a preparer or point of contact sign or send money?",
      a: [
        "No. Only the named signer, or the main contact if no signer is named, signs. Each owner verifies their own identity.",
      ],
    },
  ],
  help: [
    `Email ${SUPPORT_EMAIL}, or use Messages in your portal to contact Harmonious.`,
    "The business's team should contact you with questions about the investment itself, such as amounts, terms or documents.",
  ],
};

export const ADD_ENTITY_INVESTOR_GUIDE_DOWNLOAD = {
  href: "/downloads/Harmonious-Add-a-Fund-or-Family-Office-Guide.pdf",
  filename: "Harmonious-Add-a-Fund-or-Family-Office-Guide.pdf",
};
