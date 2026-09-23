/**
 * Every URL currently indexed on the Wix site (www.harmonious.co), classified
 * for the future cutover. Source: Wix sitemaps, captured during the Stage 1 audit.
 *
 * KEEP        — the new site must serve this exact path before cutover.
 * REDIRECT    — permanent (301) redirect to `target`.
 * CONSOLIDATE — merged with a sibling page into `target` (301).
 * REVIEW      — needs a Harmonious decision before cutover.
 */
export type UrlAction = "KEEP" | "REDIRECT" | "CONSOLIDATE" | "REVIEW";
export interface WixUrl {
  path: string;
  action: UrlAction;
  target?: string;
  note?: string;
}

export const WIX_PAGES: WixUrl[] = [
  { path: "/", action: "KEEP" },
  { path: "/home", action: "REDIRECT", target: "/", note: "Wix duplicate of the homepage" },
  { path: "/spvs", action: "KEEP", note: "SPV Administration pillar" },
  { path: "/cap-table-management", action: "KEEP", note: "Cap Table Management pillar" },
  { path: "/kyc-aml", action: "KEEP", note: "Needs a reviewed page before cutover" },
  { path: "/careers", action: "KEEP", note: "Needs content before cutover" },
  { path: "/contactus", action: "KEEP", note: "Contact / Schedule a Demo form" },
  { path: "/harmoniousclassroom", action: "KEEP", note: "Resources hub" },
  { path: "/traditionalfunds", action: "REDIRECT", target: "/fund-administration" },
  { path: "/products-solutions", action: "REDIRECT", target: "/platform" },
  { path: "/plans-pricing", action: "REDIRECT", target: "/pricing" },
  { path: "/aboutharmonious", action: "CONSOLIDATE", target: "/about" },
  { path: "/about-1", action: "CONSOLIDATE", target: "/about" },
  { path: "/privacy-policy", action: "REDIRECT", target: "/privacy" },
  { path: "/terms-conditions", action: "REDIRECT", target: "/terms" },
  { path: "/founderfunds", action: "REVIEW", note: "Founder SPVs vs Emerging Managers — depends on current page content" },
  { path: "/spvlife", action: "REVIEW", note: "Purpose unclear" },
  { path: "/file-share", action: "REVIEW", note: "Likely a utility page; do not index" },
  { path: "/items", action: "REVIEW", note: "Wix system page; probably retire" },
  { path: "/sponsorship-form", action: "REVIEW", note: "Keep only if still in use" },
  { path: "/down-for-maintenance", action: "REVIEW", note: "Retire (410)" },
  { path: "/category/all-products", action: "REVIEW", note: "Wix store; map to /pricing if store retired" },
  { path: "/product-page/master-spv", action: "REVIEW", note: "Store product → pricing/SPV section" },
  { path: "/product-page/distribution", action: "REVIEW" },
  { path: "/product-page/capital-call", action: "REVIEW" },
  { path: "/product-page/spv-series-under-master", action: "REVIEW" },
  { path: "/product-page/spv-migration", action: "REVIEW" },
];

export const WIX_CLASSROOM_CATEGORIES: WixUrl[] = [
  "private-equity",
  "special-purpose-vehicles",
  "founder-s-friday",
  "venture-capital",
  "real-estate-fund",
].map((slug) => ({ path: `/harmoniousclassroom/categories/${slug}`, action: "KEEP" as const }));

/** Every Wix article slug. All are KEEP — exact /post/<slug> preserved. */
export const WIX_ARTICLE_SLUGS = [
  "founder-s-friday-how-to-bring-on-more-investors",
  "train-your-brain-to-pitch-like-an-investor",
  "boi-reporting-funds-and-spvs",
  "the-hidden-cost-of-broken-chain-of-title",
  "master-series-entity-unveiling-the-mama-and-baby-turtles-analogy",
  "leveraging-special-purpose-vehicles-for-early-stage-fundraising-a-founder-s-strategic-advantages",
  "secondaries-can-uncover-cap-table-problems",
  "understanding-the-distinctions-506-b-vs-506-c-offerings-in-private-capital-markets",
  "what-founders-need-to-do-before-raising-international-capital",
  "what-is-a-special-purpose-vehicle",
  "the-conversation-around-the-startup-ecosystem-has-changed",
  "key-things-founders-should-know-about-looking-for-investors",
  "5-things-founders-should-do-immediately-after-pitching-investors",
  "why-investors-buy-interests-in-private-equity-funds-through-the-secondary-market",
  "understanding-treasury-regulation-1-6031-a-1",
  "going-beyond-u-s-investor-with-regulation-s",
  "faqs-founders-have-when-raising-capital",
  "understanding-secondary-spvs",
  "aml-prevent-illegal-money-from-entering-and-moving-through-the-financial-system",
  "angel-groups-vs-syndicators",
  "what-founders-should-actually-know",
  "does-an-entity-count-as-one-investor-or-many-a-practical-primer-for-3-c-1-and-3-c-7-spvs",
  "private-vs-public-investment-markets",
  "understanding-know-your-customer-kyc-and-anti-money-laundering-aml",
  "private-market-investors",
  "choosing-the-right-investment-instrument-comparing-convertible-notes-safes-stocks-and-equity",
  "fundraising-is-a-two-way-diligence-process",
  "how-to-stay-motivated-as-a-founder",
  "quick-practical-tips-for-emerging-fund-managers",
  "founder-s-friday-getting-funding-is-a-huge-milestone-but-that-doesn-t-mean-things-will-be-easier",
  "why-fund-managers-use-deal-rooms",
  "founders-friday-one-of-the-most-misunderstood-dynamics-is-the-option-pool-increase",
  "managing-multiple-investors-without-losing-the-relationship",
  "deal-room-speed",
  "secondary-markets-are-growing",
  "staying-organized-as-a-founder",
  "talking-to-the-wrong-investors",
  "entrepreneurship-misconceptions",
  "founder-s-friday-you-ve-secured-funding-now-what",
  "40-must-know-definitions",
  "choosing-the-right-structure-for-your-spv-master-series-llc-vs-gp-lp-vs-standalone-llc",
  "founder-s-friday-structure-your-round-in-a-way-to-set-up-future-success",
  "founder-s-friday-keeping-your-investors-happy",
  "pairing-reg-s-with-reg-d",
  "why-liquidity-can-increase-company-value-even-when-no-one-sells",
  "k-1-requirements-for-u-s-spvs-and-funds-and-the-deadlines-that-actually-matter",
  "what-broker-dealers-actually-do",
  "founder-s-friday-pressures-after-securing-funding",
  "spv-pe-vc-funds-what-are-the-differences",
  "founder-s-friday-how-to-build-a-winning-company",
  "the-stress-of-success",
  "how-a-relationship-with-an-investor-actually-ends",
  "the-return-of-fundamentals-why-investors-care-about-cash-flow-again",
  "why-a-cap-table-can-matter-more-than-valuation-in-secondary-transactions",
  "the-questions-every-founder-should-ask-a-potential-investor",
] as const;

export const WIX_ARTICLES: WixUrl[] = WIX_ARTICLE_SLUGS.map((slug) => ({
  path: `/post/${slug}`,
  action: "KEEP" as const,
}));

export const ALL_WIX_URLS: WixUrl[] = [...WIX_PAGES, ...WIX_CLASSROOM_CATEGORIES, ...WIX_ARTICLES];

/**
 * Old paths on THIS project's hosts that moved to the Wix-equivalent path.
 * Served as 301s by thin redirect routes.
 */
export const PROJECT_REDIRECTS: Record<string, string> = {
  "/spv": "/spvs",
  "/cap-table": "/cap-table-management",
};
