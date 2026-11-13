import json
A, G = "All", "Growth"
S = []
def sec(title, intro, qs): S.append({"title": title, "intro": intro, "questions": [{"q": q[0], "stage": q[1], "docs": (q[2] if len(q) > 2 else "")} for q in qs]})

sec("Company Overview and Structure", "Who the company is, how it is organized and where it operates.", [
 ("Provide the company's full legal name, any trade names, the state or country of formation, and the date of formation.", A, "Certificate of incorporation or formation"),
 ("Describe the business in two or three sentences: what you sell, to whom, and why customers buy it.", A),
 ("What type of entity is the company (for example C corporation or LLC)? Has it ever converted from another entity type?", A),
 ("List every parent, subsidiary and affiliated entity with its jurisdiction and the company's ownership percentage.", A, "Organizational chart"),
 ("List the headquarters and every other office or facility, and whether each is owned or leased.", A, "Real estate leases"),
 ("List every state and country where the company is registered or qualified to do business.", G, "Certificates of good standing"),
 ("Has the company changed its name, merged, reorganized or acquired another business? Describe each event.", A, "Merger or acquisition agreements"),
 ("Provide the company website and current investor materials.", A, "Pitch deck and one-page summary"),
])
sec("Leadership, Board and Governance", "The people who run the company and how decisions are made.", [
 ("List each founder and executive with title, start date, ownership percentage and a short biography.", A, "Biographies or resumes"),
 ("List current directors and board observers, who appointed each, and any board committees.", A),
 ("Describe how major decisions are approved, including any stockholder or investor approval rights.", A, "Bylaws or operating agreement"),
 ("Has any founder, executive or director been subject to a criminal proceeding, regulatory action, bankruptcy, or civil fraud claim? If yes, describe.", A),
 ("Do any founders or executives hold outside jobs, board seats or business interests that take meaningful time or could conflict with the company?", A),
 ("Describe any transactions between the company and its founders, executives, directors, investors or their family members.", A, "Related-party agreements"),
 ("Have all founders and executives signed confidentiality and invention assignment agreements with the company?", A, "Signed founder and executive agreements"),
 ("Which roles would be hardest to replace? Describe succession plans for those roles.", G),
 ("Provide board and stockholder minutes and written consents for the last three years.", G, "Minutes and written consents"),
 ("Does the company have written conflict of interest, code of conduct and whistleblower policies?", G, "Governance policies"),
])
sec("Capitalization and Financing History", "Ownership, past rounds and any obligations that affect the cap table.", [
 ("Provide a fully diluted capitalization table showing every holder of stock, options, warrants, SAFEs and convertible notes.", A, "Fully diluted cap table"),
 ("List every financing round with date, instrument, amount raised, price or valuation cap, discount and lead investor.", A, "Financing documents for each round"),
 ("List all outstanding SAFEs and convertible notes with principal, interest rate, valuation cap, discount and maturity date.", A, "SAFEs and convertible notes"),
 ("Describe the equity incentive plan: total pool, shares granted, shares vested and shares still available.", A, "Equity plan and option ledger"),
 ("Describe vesting, acceleration, repurchase rights and transfer restrictions on founder shares.", A, "Founder stock purchase agreements"),
 ("Were 83(b) elections filed on time for all restricted stock?", A, "83(b) elections with proof of filing"),
 ("Describe existing investor rights: liquidation preferences, anti-dilution, pro rata rights, board seats, voting agreements, and rights of first refusal or co-sale.", A, "Investor rights, voting and first refusal agreements"),
 ("When was the most recent 409A valuation completed, and what was the common stock value?", A, "Most recent 409A valuation report"),
 ("Has anyone been promised equity that is not yet documented (advisors, employees, partners or service providers)?", A),
 ("List all loans, credit lines, venture debt, liens and guarantees with key terms and covenants.", A, "Loan and security agreements"),
 ("Is the company in compliance with every loan covenant?", G),
 ("Have there been any secondary sales, share repurchases or redemptions? Describe.", G),
])
sec("Product, Technology and Intellectual Property", "What the company has built and whether it clearly owns it.", [
 ("Describe the product or service, its current stage (concept, prototype, beta or launched) and the roadmap for the next 18 months.", A, "Product roadmap"),
 ("What problem does the product solve, and what makes it hard to copy?", A),
 ("Describe the technology and architecture at a high level, including key components licensed from others.", A),
 ("List all patents, patent applications, trademarks, copyrights and domain names, with owner and status.", A, "Intellectual property schedule"),
 ("Has every founder, employee and contractor who created company technology assigned their rights to the company?", A, "Invention assignment agreements"),
 ("Did any founder or employee develop company technology while employed by another company or a university?", A),
 ("Does the company license intellectual property to or from anyone? Describe the terms.", A, "License agreements"),
 ("Has anyone claimed the company infringes their intellectual property, or has the company claimed infringement by others?", A),
 ("Does the product use artificial intelligence or machine learning? Describe the data used and the company's rights to that data.", A),
 ("Does the product include open source software? Describe the licenses used and how compliance is managed.", G, "Open source inventory"),
 ("Describe development practices: team size, release frequency, testing and any significant outages in the last two years.", G),
])
sec("Market, Customers and Competition", "Who buys, why they buy and who else competes for them.", [
 ("Describe the target market and customer profile, with your estimate of market size and its sources.", A),
 ("List your main competitors and alternatives, and how you compare on product, price and distribution.", A),
 ("What are the main barriers to entry, and how will you defend your position?", A),
 ("Describe the go-to-market strategy and primary sales channels.", A),
 ("Describe pricing and how it has changed over time.", A, "Current price list"),
 ("Does any single customer, partner or supplier account for more than 10% of revenue or purchases?", A),
 ("Which suppliers or partners would materially affect the business if lost?", A),
 ("List your top 10 customers by revenue for the last 12 months, with share of revenue and contract term.", G, "Top customer list"),
 ("Have you lost any significant customers in the last 24 months? Why?", G),
 ("Provide customer references the fund may contact.", G, "Customer reference list"),
])
sec("Traction and Key Metrics", "Evidence of progress and the numbers you manage the business by.", [
 ("Provide monthly revenue or bookings for the last 24 months, or since launch.", A, "Monthly revenue report"),
 ("List the key metrics you track, with definitions and recent values (for example users, recurring revenue, retention, churn, acquisition cost, lifetime value, gross margin).", A, "Metrics dashboard"),
 ("What milestones will this funding achieve, and by when?", A),
 ("Describe the sales pipeline by stage, value and expected close date.", G, "Pipeline report"),
 ("Provide cohort retention or net revenue retention data.", G, "Cohort analysis"),
 ("What assumptions drive your forecast, and how have past forecasts compared with actual results?", G),
])
sec("Financial Information", "Historical results, current cash position and financial controls.", [
 ("Provide income statements, balance sheets and cash flow statements for the last three fiscal years and year to date.", A, "Financial statements"),
 ("Are the statements audited, reviewed, compiled or prepared internally? Name the accounting firm, if any.", A, "Audit or review reports"),
 ("Provide the current budget and a three-year projection with assumptions.", A, "Budget and financial projections"),
 ("What are the current cash balance, average monthly net burn and runway in months?", A),
 ("Are there any off-balance-sheet arrangements, contingent liabilities or guarantees?", A),
 ("Has the company received any government grants, loans or subsidies? Describe any conditions or repayment obligations.", A, "Grant or government loan agreements"),
 ("Are the books kept on a cash or accrual basis? Describe revenue recognition policies.", G),
 ("Provide accounts receivable and accounts payable aging reports.", G, "Receivable and payable aging"),
 ("Describe any deferred revenue, customer prepayments or refund obligations.", G),
 ("Describe financial controls: who approves payments, how often accounts are reconciled and how duties are separated.", G),
 ("List all bank and payment accounts and their authorized signers.", G),
 ("Has your accountant or auditor raised any material weaknesses or significant adjustments?", G, "Auditor management letters"),
])
sec("Tax", "Filings, open matters and tax attributes that affect value.", [
 ("List every jurisdiction where the company files tax returns, and provide returns for the last three years.", A, "Federal and state tax returns"),
 ("Are all returns filed and all taxes paid? Are any audits, notices or disputes open?", A, "Tax notices or correspondence"),
 ("Are payroll taxes current? Could any contractors be reclassified as employees?", A),
 ("Has the company tracked whether its stock may qualify as qualified small business stock under Section 1202 (including gross assets at each issuance)?", A),
 ("Does the company collect and pay sales, use or value-added tax where required?", G),
 ("Has the company claimed research and development tax credits? Provide support.", G, "Research credit study"),
 ("Does the company have net operating losses, and could an ownership change limit them?", G),
 ("Does the company have operations, employees or related entities outside the United States that create tax obligations?", G),
])
sec("Legal and Litigation", "Disputes, claims and the advisers who handle them.", [
 ("Is the company involved in, or aware of a threat of, any lawsuit, arbitration, government investigation or claim?", A, "Complaints, demand letters or notices"),
 ("Describe any litigation in the last five years and its outcome.", A),
 ("Are there any judgments, settlements, consent orders or injunctions against the company?", A, "Settlement agreements and orders"),
 ("Has any former founder, employee or adviser claimed equity, pay or ownership in the company?", A),
 ("Identify the company's outside legal counsel and accounting firm.", A),
])
sec("Material Contracts", "Agreements that drive revenue, cost or restrictions on the business.", [
 ("Provide every contract that is material to the business, including any worth more than $50,000 a year.", A, "Material contracts"),
 ("Do any contracts include exclusivity, non-compete, most-favored-nation, minimum purchase or change-of-control terms?", A),
 ("Is the company in breach of any contract, or has it received notice of a breach?", A),
 ("Provide standard customer terms, supplier terms and partnership agreements.", A, "Standard customer and supplier terms"),
 ("Would this investment or a future sale require consent from any contract party?", G),
 ("List any government contracts and any security clearance or set-aside requirements.", G, "Government contracts"),
])
sec("Regulatory and Compliance", "Licenses, oversight and rules that apply to the business.", [
 ("List every license, permit, registration and approval the business needs, with its status.", A, "Licenses and permits"),
 ("Which regulators oversee the company? Describe any examinations, inquiries or findings.", A, "Regulator correspondence"),
 ("Does the company screen customers, partners and investors against sanctions lists? Does it do business in, or with people from, sanctioned countries?", A),
 ("If the company handles payments, lending, securities or digital assets, describe its licensing and anti-money laundering program.", A, "Anti-money laundering program"),
 ("If the company operates in healthcare, food, consumer products, energy or another regulated sector, describe the required approvals and quality systems.", A),
 ("List all past securities offerings, the exemptions relied on and the filings made (for example Form D and state notices).", A, "Form D and state notice filings"),
 ("Does the company have an anti-bribery and anti-corruption policy? Does it deal with government officials or government-owned customers?", G, "Anti-corruption policy"),
 ("Are any products, software or technical data subject to export controls? Describe classifications and licenses.", G),
 ("Will any non-U.S. person gain control, board rights or access to sensitive technology through this investment?", G),
 ("Does marketing follow advertising, email, text message, telemarketing and endorsement rules?", G),
])
sec("Data Privacy and Cybersecurity", "How the company protects the information it holds.", [
 ("What personal or sensitive data does the company collect, and where is it stored?", A),
 ("Which privacy laws apply (for example state privacy laws, GDPR, HIPAA or COPPA), and how does the company comply?", A, "Privacy policy"),
 ("Describe security controls: access management, multi-factor authentication, encryption, logging, backups and vulnerability testing.", A, "Information security policy"),
 ("Has the company had any data breach, ransomware attack or security incident? Describe it and any notices given.", A),
 ("Does the company sell or share personal data with others?", A),
 ("Has the company completed an independent security assessment or certification (for example SOC 2 or ISO 27001)?", G, "Assessment or certification report"),
 ("Does the company have incident response and business continuity plans? When were they last tested?", G, "Incident response and continuity plans"),
 ("How are vendors with access to company or customer data reviewed?", G),
])
sec("People and Human Resources", "The team, how it is paid and any employment risks.", [
 ("Provide headcount by function and location, separating employees from contractors.", A, "Employee and contractor list"),
 ("Describe executive pay: salary, bonus, equity and severance.", A),
 ("Do all employees and contractors sign agreements covering confidentiality and assignment of their work to the company?", A, "Template employee and contractor agreements"),
 ("Are there any employment claims, harassment or discrimination complaints, or wage and hour issues?", A),
 ("Are any team members bound by non-compete or non-solicitation agreements with former employers?", A),
 ("Which key hires are planned in the next 12 months?", A),
 ("Describe employee benefits, including retirement and health plans.", G, "Benefit plan documents"),
 ("Does the company complete work authorization checks for every employee? Are any employees on visas?", G),
 ("Are any employees covered by a union or collective bargaining agreement?", G),
 ("What was employee turnover in the last 12 months?", G),
])
sec("Environmental, Social and Governance", "Impact, responsible business practices and fund restrictions.", [
 ("Does the company have environmental impacts, permits or liabilities (for example hazardous materials)?", A),
 ("Does the company engage in any activity on the fund's restricted or excluded investment list, if the fund provided one?", A),
 ("Does the company set or report sustainability or impact goals?", G, "Sustainability or impact report"),
 ("Describe workforce composition and inclusion policies, if tracked.", G),
 ("Describe labor practices in the supply chain and any forced labor risk.", G),
])
sec("Insurance and Risk Management", "Coverage in place and the risks you are managing.", [
 ("List each insurance policy with carrier, coverage type, limits and renewal date (for example general liability, directors and officers, errors and omissions, cyber, property and workers' compensation).", A, "Certificates of insurance"),
 ("What are the five biggest risks to the business, and how are you addressing each?", A),
 ("Is there anything that could materially affect the business that has not been disclosed elsewhere in this questionnaire?", A),
 ("Have any insurance claims been filed or denied in the last three years?", G),
])
sec("Current Round and Use of Proceeds", "The financing the fund is being asked to join.", [
 ("Describe the current round: instrument, amount, valuation or cap, and investors already committed.", A, "Term sheet"),
 ("Provide a detailed use of proceeds.", A, "Use of proceeds schedule"),
 ("How many months will this round fund the company, and what is the plan for the next financing?", A),
 ("Are any finders, brokers or placement agents being paid in connection with this round?", A),
 ("Are there conditions to closing, such as a minimum raise or required consents?", A),
 ("What is the long-term exit strategy, and who are likely acquirers?", G),
])
sec("Investor Reporting and Information Rights", "What the fund will receive after it invests.", [
 ("What information will you share with investors, and how often (for example monthly updates, quarterly financials and annual statements)?", A),
 ("Will you deliver annual financial statements within 120 days of year end, and the information the fund needs for valuations and tax reporting (including Schedule K-1s if the company is a partnership)?", A),
 ("Will you notify investors promptly of material events such as new financings, litigation, executive departures or loan defaults?", A),
 ("Who is the primary contact for investor communications? Provide name, title, email and phone.", A),
])

CO = ["Company legal name", "Trade name (if different)", "Website", "State or country of formation",
      "Current stage (pre-seed, seed, Series A, Series B, Series C or later, growth)", "Round being raised",
      "Requesting fund", "Prepared by (name and title)", "Email", "Phone", "Date completed"]
INSTR = [
 "Answer every question marked All. Questions marked Growth apply to companies at Series B or later, or with meaningful revenue. Earlier companies may answer them if they apply or write N/A.",
 "Keep answers short and factual. Where a document is requested, attach it or say where it can be found in your data room.",
 "If an answer is No, None or Not applicable, write that rather than leaving it blank, so the fund knows the question was considered.",
 "Mark any answer or document you consider confidential. If you need a confidentiality agreement before sharing, ask the fund manager.",
 "Tell the fund promptly if anything changes before the investment closes.",
]
CERT = "The undersigned, an authorized officer of the company, confirms that to the best of their knowledge after reasonable inquiry the responses and documents provided are true, complete and not misleading, and agrees to notify the requesting fund promptly of any material change before the investment closes."
CERT_FIELDS = ["Name", "Title", "Signature", "Date"]
json.dump({"title": "Portfolio Company Due Diligence Questionnaire", "sections": S, "company": CO, "instructions": INSTR, "cert": CERT, "certFields": CERT_FIELDS}, open("/tmp/ddq/content.json", "w"), indent=1)
n = sum(len(s["questions"]) for s in S); print(len(S), "sections", n, "questions", sum(1 for s in S for q in s["questions"] if q["stage"]=="All"), "all-stage")
