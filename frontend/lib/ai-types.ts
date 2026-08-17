// Mirrors backend/app/ai/models.py — the AI product agent's conversation
// contract. See plans/09 §1-13.

export interface AiOptionValue {
  valueId: string;
  label: string;
}

export interface AiOption {
  key: string;
  label: string;
  values: AiOptionValue[];
}

// One valueId per option, in the SAME order as draft.options. The app joins
// these into a real variant_key — the agent never emits that string itself.
// See plans/09 §6.
export interface AiVariantPlanEntry {
  values: string[];
  state: "made" | "not_made";
  stock: number;
  sku?: string | null;
}

export interface AiProductDraft {
  name: string | null;
  slug: string | null;
  category: string | null;
  collection: string | null;
  blurb: string | null;
  care: string[];
  sku: string | null;
  alt: string | null;
  basePrice: number | null;
  material: string | null;
  options: AiOption[];
  variantPlan: AiVariantPlanEntry[];
}

export interface AiQuestion {
  id: string;
  text: string;
  blocking: boolean;
  choices?: string[] | null;
}

export interface AiSuggestion {
  field: string;
  reason: string;
}

export interface AiTurnResult {
  visualFacts: string;
  message: string;
  questions: AiQuestion[];
  draft: AiProductDraft;
  suggestions: AiSuggestion[];
  autoDecided: string[];
  done: boolean;
}

// --- Product-edit chat (mirrors backend/app/ai/edit_models.py) ---

export interface AiProductPatch {
  name: string | null;
  category: string | null;
  collection: string | null;
  collectionChanged: boolean;
  basePrice: number | null;
  material: string | null;
  blurb: string | null;
  care: string[] | null;
  isFeatured: boolean | null;
  isActive: boolean | null;
}

export interface AiVariantPatch {
  variantId: string;
  stock: number | null;
  sku: string | null;
}

export interface AiNewVariant {
  values: string[];
  stock: number;
  sku: string | null;
}

export interface AiEditProposal {
  productPatch: AiProductPatch;
  variantPatches: AiVariantPatch[];
  newVariants: AiNewVariant[];
  summary: string[];
}

export interface AiEditTurnResult {
  message: string;
  proposal: AiEditProposal;
}

export interface AiEditChatMessage {
  role: "user" | "assistant";
  content: string;
}

export function editProposalIsEmpty(p: AiEditProposal): boolean {
  const patch = p.productPatch;
  const patchHasChange = Object.entries(patch).some(([k, v]) => {
    if (k === "collectionChanged") return false;
    return v !== null;
  });
  return !patchHasChange && p.variantPatches.length === 0 && p.newVariants.length === 0;
}

export const EMPTY_AI_DRAFT: AiProductDraft = {
  name: null,
  slug: null,
  category: null,
  collection: null,
  blurb: null,
  care: [],
  sku: null,
  alt: null,
  basePrice: null,
  material: null,
  options: [],
  variantPlan: [],
};
