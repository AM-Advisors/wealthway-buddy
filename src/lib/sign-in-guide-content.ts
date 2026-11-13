/**
 * Sign-in guide content for clients and investors. Single source for the public
 * guide page, the help center articles and the printable PDFs
 * (scripts/sign-in-guide). Labels quote the real on-screen text; keep them in
 * step with the sign-in, invitation and security screens.
 */

export type SignInAudience = "client" | "investor";

export type GuideMock =
  | "client-invite-email"
  | "invite-page"
  | "investor-invite-email"
  | "create-account"
  | "confirm-email"
  | "protect"
  | "recovery-codes"
  | "platform-documents"
  | "journey"
  | "client-sign-in"
  | "investor-sign-in"
  | "confirm-its-you";

export type GuideStep = {
  title: string;
  paragraphs: string[];
  /** Exact buttons or headings the person will see on this step. */
  labels: string[];
  mock?: GuideMock;
};

export type GuideQuestion = { q: string; a: string[] };

export type SignInGuide = {
  audience: SignInAudience;
  eyebrow: string;
  title: string;
  intro: string;
  signInAddress: string;
  firstTime: GuideStep[];
  nextTime: GuideStep[];
  questions: GuideQuestion[];
  help: string[];
};

export const SUPPORT_EMAIL = "support@harmonious.co";

const SECOND_STEP: GuideStep = {
  title: "Add your second sign-in step",
  paragraphs: [
    "Harmonious asks for a second step at every sign-in, so nobody can get in with your password alone.",
    "Choose Use an authenticator app. Open the authenticator app on your phone, scan the square code on the screen, then type the 6-digit code the app shows and select Confirm.",
    "If your device offers it, you can choose a passkey instead and confirm with your face, fingerprint or device PIN.",
  ],
  labels: ["Protect your account", "Use an authenticator app", "Confirm"],
  mock: "protect",
};

const RECOVERY: GuideStep = {
  title: "Save your recovery codes",
  paragraphs: [
    "Next you'll see a short list of recovery codes. Each code works once if you lose your phone or change devices, and they are not shown again.",
    "Print them, write them down or keep them in a password manager, then select I've saved them.",
  ],
  labels: ["Save your recovery codes", "I've saved them"],
  mock: "recovery-codes",
};

const CODE_EACH_TIME: GuideStep = {
  title: "Enter your code",
  paragraphs: [
    "After your password, the Confirm it's you screen appears. Open your authenticator app, type the current 6-digit code and select Verify code. If you set up a passkey, select Use passkey instead.",
  ],
  labels: ["Confirm it's you", "Verify code"],
  mock: "confirm-its-you",
};

const SHARED_QUESTIONS = (audience: SignInAudience): GuideQuestion[] => [
  {
    q: "I forgot my password",
    a: [
      "On the sign-in page, select Forgot your password?, enter your email and select Send reset link.",
      "Open the email titled Reset your password and select Reset Password. Type your new password twice and select Save new password. The link expires shortly, so use it soon.",
    ],
  },
  {
    q: "My invitation link says it has expired or was already used",
    a: audience === "client"
      ? ["If you already chose a password, just sign in. Otherwise ask your Harmonious contact to send a new invitation link."]
      : ["If you already have a login, sign in and your investment will be there. Otherwise ask the fund manager to send you a new invitation."],
  },
  {
    q: "It says it could not find a fund invitation for my email",
    a: [
      "Use the exact email address your invitation was sent to. Each email address is a separate login, so a work and a personal address are two different accounts.",
      audience === "client"
        ? "To use a different address, ask your Harmonious contact to invite that address."
        : "To use a different address, ask the fund manager to invite that address.",
    ],
  },
  {
    q: "Continue with Google didn't work",
    a: [
      "Choose the Google account that uses the same email address your invitation was sent to.",
      "If you see Google sign-in isn't available right now, sign in with your email and password instead.",
    ],
  },
  {
    q: "I have a new phone or lost my phone",
    a: [
      "On the Confirm it's you screen, select Lost access? Use a recovery code. Enter one of your saved codes and select Use recovery code. You'll then set up your second step again on your new phone.",
    ],
  },
  {
    q: "I don't have my recovery codes",
    a: [
      `Email ${SUPPORT_EMAIL}. To protect your account, two Harmonious team members confirm your identity before your second step is reset.`,
    ],
  },
  {
    q: "I was signed out without doing anything",
    a: [
      "For your security, you're signed out after 15 minutes without activity. A message appears first with a countdown. Select Continue to stay signed in.",
    ],
  },
  {
    q: "Keeping your account safe",
    a: [
      "Never share your password, your 6-digit codes or your recovery codes with anyone, including someone who says they work for Harmonious or the fund.",
    ],
  },
];

export const SIGN_IN_GUIDES: Record<SignInAudience, SignInGuide> = {
  client: {
    audience: "client",
    eyebrow: "Client guide",
    title: "Signing in to Harmonious",
    intro: "For fund managers and the people on their team. Everyone on your team has their own login, and every approval is recorded under their own name. Keep your phone nearby for the second sign-in step.",
    signInAddress: "app.harmonious.co/client-login",
    firstTime: [
      {
        title: "Open your invitation email",
        paragraphs: [
          "Look for the email from Harmonious and select Set your password.",
          "The link is personal to you. It works once and expires 7 days after it was sent.",
        ],
        labels: ["Set your password"],
        mock: "client-invite-email",
      },
      {
        title: "Set up your account",
        paragraphs: [
          "On the page that opens, select Set up my account, then choose a password with at least 8 characters.",
          "Your login uses the email address the invitation was sent to. That is how your funds are linked to you.",
        ],
        labels: ["Welcome", "Set up my account"],
        mock: "invite-page",
      },
      SECOND_STEP,
      RECOVERY,
      {
        title: "Accept your platform documents",
        paragraphs: [
          "The first time you sign in, you'll see Before you continue. Open each document listed, such as the Privacy Policy, Terms of Service, Fee schedule and Electronic signatures consent.",
          "Tick the box at the bottom, type your full name and select I agree. Your portal then opens. If it asks you to verify your identity, have your government ID ready and follow the steps on screen.",
        ],
        labels: ["Before you continue", "I agree"],
        mock: "platform-documents",
      },
    ],
    nextTime: [
      {
        title: "Go to the client sign-in page",
        paragraphs: [
          "Go to app.harmonious.co/client-login, or select Client Login at the top of harmonious.co.",
          "Enter your email and password and select Sign in to my portal. If your invited email is a Google account, you can select Continue with Google instead.",
        ],
        labels: ["Client sign in", "Sign in to my portal", "Continue with Google"],
        mock: "client-sign-in",
      },
      CODE_EACH_TIME,
    ],
    questions: SHARED_QUESTIONS("client"),
    help: [
      `Email ${SUPPORT_EMAIL}, or reply to your invitation email.`,
      "Once you're signed in, you can also use Messages to contact Harmonious.",
    ],
  },
  investor: {
    audience: "investor",
    eyebrow: "Investor guide",
    title: "Signing in to Harmonious",
    intro: "For investors opening an investment for the first time and signing in afterward. Your login is personal to you, even when you invest through a trust or a company. Keep your phone nearby for the second sign-in step.",
    signInAddress: "app.harmonious.co/investor-login",
    firstTime: [
      {
        title: "Open your fund invitation",
        paragraphs: [
          "Look for the email about your investment and select its button, such as Begin onboarding.",
          "Some invitations say Set your password and sign in instead. Select it, then select Set up my account on the page that opens. That link works once and expires 7 days after it was sent.",
        ],
        labels: ["Begin onboarding", "Set your password and sign in"],
        mock: "investor-invite-email",
      },
      {
        title: "Create your account, or sign in",
        paragraphs: [
          "New to Harmonious? Select Set up your account below the sign-in box. Enter the email address your invitation was sent to, choose a password with at least 8 characters and select Create account.",
          "Already have a Harmonious login? Sign in with it instead. Your new investment is added to the same login.",
        ],
        labels: ["Set up your account", "Create your account", "Create account"],
        mock: "create-account",
      },
      {
        title: "Confirm your email",
        paragraphs: [
          "We send you an email titled Confirm your email. Open it and select Confirm email.",
          "Can't find it? Check your spam or junk folder.",
        ],
        labels: ["Check your email", "Confirm email"],
        mock: "confirm-email",
      },
      SECOND_STEP,
      RECOVERY,
      {
        title: "Continue your investment",
        paragraphs: [
          "Your investment opens with its steps in order: About You, Verification, Sign and Fund.",
          "You can stop at any time. Your progress is saved, and the button at the top always takes you to your next step.",
        ],
        labels: ["About You", "Verification", "Sign", "Fund"],
        mock: "journey",
      },
    ],
    nextTime: [
      {
        title: "Go to the investor sign-in page",
        paragraphs: [
          "Go to app.harmonious.co/investor-login, or select the link in any email about your investment.",
          "Enter your email and password and select Sign in to my investments. If your invited email is a Google account, you can select Continue with Google instead.",
        ],
        labels: ["Investor sign in", "Sign in to my investments", "Continue with Google"],
        mock: "investor-sign-in",
      },
      CODE_EACH_TIME,
    ],
    questions: SHARED_QUESTIONS("investor"),
    help: [
      `For sign-in problems, email ${SUPPORT_EMAIL}.`,
      "For questions about the investment itself, such as amounts, terms or documents, contact the fund manager.",
    ],
  },
};

export const SIGN_IN_GUIDE_DOWNLOADS: Record<SignInAudience, { href: string; filename: string }> = {
  client: { href: "/downloads/Harmonious-Client-Sign-In-Guide.pdf", filename: "Harmonious-Client-Sign-In-Guide.pdf" },
  investor: { href: "/downloads/Harmonious-Investor-Sign-In-Guide.pdf", filename: "Harmonious-Investor-Sign-In-Guide.pdf" },
};
