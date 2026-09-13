export type RuleDefinition = {
  key: string;
  code: string;
  requirement: string;
  automatedCheck: string;
  manualReview: string;
  evaluation: "Automated" | "Manual review required" | "Not currently evaluated";
};

export const RULES: RuleDefinition[] = [
  { key: "Rule 6(1) MRP", code: "Rule 6(1)", requirement: "Maximum Retail Price", automatedCheck: "Presence-based OCR extraction", manualReview: "Price statement clarity and statutory presentation", evaluation: "Automated" },
  { key: "Rule 6(2) Net Quantity", code: "Rule 6(2)", requirement: "Net Quantity", automatedCheck: "Presence-based OCR extraction", manualReview: "Unit correctness, font size and placement", evaluation: "Automated" },
  { key: "Rule 6(3) Packing Date", code: "Rule 6(3)", requirement: "Packing Date", automatedCheck: "Presence-based OCR extraction", manualReview: "Legibility and date format", evaluation: "Automated" },
  { key: "Rule 6(4) Consumer Care", code: "Rule 6(4)", requirement: "Consumer Care Details", automatedCheck: "Phone or email presence", manualReview: "Completeness of responsible party details", evaluation: "Automated" },
  { key: "Rule 6(5) Country of Origin", code: "Rule 6(5)", requirement: "Country of Origin", automatedCheck: "Presence-based OCR extraction", manualReview: "Applicability and declaration presentation", evaluation: "Automated" },
  { key: "FSSAI Food Safety Lic", code: "FSSAI", requirement: "Food Safety Licence", automatedCheck: "14-digit licence pattern presence", manualReview: "Applicability and licence validity", evaluation: "Automated" },
];

export const ruleForKey = (key: string) => RULES.find((rule) => rule.key === key) ?? {
  key,
  code: key,
  requirement: key,
  automatedCheck: "Model output",
  manualReview: "Manual review required",
  evaluation: "Manual review required" as const,
};
