"""Content for the investor onboarding guide PDF.

Plain words, no stand-alone dashes, American spelling, no outside platform names.
Mirrors the real investor flow: invitation link, account, details, verification,
questions, tax form, review and sign, funding, manager approval.
"""

SUPPORT = "support@harmonious.co"

GUIDE = {
    "title": "Completing your investment",
    "eyebrow": "Investor guide",
    "running": "Investor guide",
    "intro": (
        "This guide walks you through investing in a fund on Harmonious, from the "
        "invitation email to your signed documents. Most investors finish in one "
        "sitting of about 15 to 20 minutes. You can stop at any time and pick up "
        "where you left off."
    ),
    "where": "Open the link in your invitation email",
    "before": [
        "The email address your invitation was sent to.",
        "Your legal name, exactly as it appears on your government ID.",
        "A photo of your government ID, such as a passport or driver's license. You can take the photo with your phone during the identity check.",
        "Your tax details: a Social Security number or tax ID for a W-9, or your country details for a W-8.",
        "If you are investing through an entity or trust: its legal name, formation documents and tax ID.",
        "Your bank information, so you can send your investment when you are ready.",
    ],
    "groups": [
        {
            "heading": "Getting started",
            "steps": [
                {
                    "title": "Open your invitation",
                    "paragraphs": [
                        "The fund sends you an email with a personal link. Select the button in the email to open your investment. The link is yours alone, so do not forward it.",
                        "If the fund shared a general link instead, open it and enter your own details to begin.",
                    ],
                    "labels": ["Complete Onboarding"],
                },
                {
                    "title": "Create your account",
                    "paragraphs": [
                        "Enter your email address and choose a password. Use the same email address the invitation was sent to, so your account connects to your investment.",
                        "We email you a confirmation link. Open it to confirm your address, then sign in.",
                    ],
                    "labels": ["Create account", "Confirm email", "Sign in"],
                },
            ],
        },
        {
            "heading": "Your details",
            "steps": [
                {
                    "title": "Tell us who is investing",
                    "paragraphs": [
                        "Choose whether you are investing as an individual or through a business, trust or retirement account. Enter the legal name of the investor exactly as it should appear on the documents.",
                        "This name goes on your subscription documents and tax forms, so check it carefully before moving on.",
                    ],
                    "labels": ["Individual", "Business / organization"],
                },
                {
                    "title": "Answer the fund's questions",
                    "paragraphs": [
                        "The fund asks a short set of questions, such as your address, how you heard about the fund and whether you are an accredited investor. Answer each one and save.",
                        "Your answers carry forward, so you will not be asked the same thing twice.",
                    ],
                    "labels": ["Questions", "Save and continue"],
                },
            ],
        },
        {
            "heading": "Verification",
            "steps": [
                {
                    "title": "Verify your identity",
                    "paragraphs": [
                        "Take a photo of your government ID and a short selfie video with your phone or computer camera. This usually takes under two minutes.",
                        "If you are investing through an entity, each owner and the person signing may be asked to verify their own identity. They get their own email with their own link.",
                    ],
                    "labels": ["Verify identity"],
                },
                {
                    "title": "Complete your tax form",
                    "paragraphs": [
                        "The platform shows you the right tax form for your situation: a W-9 for US investors or a W-8 for investors outside the US. Fill it in and sign it on screen.",
                        "If you have signed one before for the same investor, your earlier answers are reused where they still apply.",
                    ],
                    "labels": ["W-9", "W-8", "Sign"],
                },
            ],
        },
        {
            "heading": "Review, sign and fund",
            "steps": [
                {
                    "title": "Review and sign your documents",
                    "paragraphs": [
                        "Read your subscription documents on screen. They are filled in with the details you entered. When you are ready, sign electronically.",
                        "You can download a copy at any time. If anything looks wrong, stop and contact the fund before signing.",
                    ],
                    "labels": ["Review documents", "Sign"],
                },
                {
                    "title": "Send your investment",
                    "paragraphs": [
                        "After signing, you see the fund's wire instructions. Send your investment from your bank using those exact details, including the reference shown.",
                        "The fund confirms when your money arrives. Sending funds does not by itself complete your investment.",
                    ],
                    "labels": ["Wire instructions"],
                },
                {
                    "title": "Wait for final approval",
                    "paragraphs": [
                        "The fund manager reviews and approves your investment. Once approved, the manager countersigns and your final signed copies appear in your account.",
                        "You can sign in at any time to see where things stand and to download your documents.",
                    ],
                    "labels": ["Approved", "Download"],
                },
            ],
        },
    ],
    "cards": {
        "heading": "What the statuses mean",
        "intro": "Your investment page shows one status at a time. Here is what each one means.",
        "items": [
            {
                "title": "Waiting on you",
                "body": "There is a step only you can do, such as answering questions, verifying your identity or signing. The page shows one clear next button.",
                "labels": ["Continue"],
            },
            {
                "title": "In review",
                "body": "Something you sent is being checked, such as your identity or a document. There is nothing for you to do unless we ask for more.",
                "labels": [],
            },
            {
                "title": "Ready to fund",
                "body": "Your documents are signed. Send your investment using the wire instructions shown.",
                "labels": ["Wire instructions"],
            },
            {
                "title": "Approved",
                "body": "The fund manager has approved your investment. Your final signed documents are in your account.",
                "labels": ["Download"],
            },
        ],
    },
    "questions": [
        {
            "q": "My invitation link does not work.",
            "a": [
                "Links expire after 30 days. Ask the fund to send you a fresh invitation. Signing in with the same email address also opens your investment, even without the link.",
            ],
        },
        {
            "q": "My name or entity name is wrong on the documents.",
            "a": [
                "Do not sign. Contact the fund and ask them to correct the investor details. They update the record and the documents are prepared again with the right name.",
            ],
        },
        {
            "q": "I want to invest a different amount.",
            "a": [
                "Contact the fund before you sign. They update the amount and the documents are prepared again. If you have already signed, the fund decides how to handle the change.",
            ],
        },
        {
            "q": "Someone else helps me with paperwork.",
            "a": [
                "The fund can add an assistant or adviser to prepare details for you, and can name the right person to sign. Each helper gets their own email and their own access. Ask the fund to set this up.",
            ],
        },
        {
            "q": "I never got the confirmation email.",
            "a": [
                "Check your spam or junk folder first. If it is not there, use the sign-in page and choose the password reset option, or contact us and we will help.",
            ],
        },
        {
            "q": "Can I sign on paper instead?",
            "a": [
                "Yes. Ask the fund for a packet to sign on paper. You still verify your identity on the platform, and the fund records your signed copies once you return them.",
            ],
        },
    ],
    "help": [
        "Questions about the fund, your amount or your documents: contact the fund directly. They manage your investment.",
        "Trouble signing in, with your link or with the platform: email us and include the email address your invitation was sent to.",
    ],
}
