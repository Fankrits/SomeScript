export const TEMPLATE_CATEGORIES = [
  "General",
  "Academic & Research",
  "Resume & CV",
  "Report & Assignment",
  "IEEE / Conference",
  "Thesis & Dissertation",
  "Presentation (Beamer)",
  "Letter & Memo",
] as const;

export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];
