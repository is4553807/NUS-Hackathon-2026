import { zodTextFormat } from "openai/helpers/zod.js";
import { z } from "zod";

import { agentConfig } from "../config.js";
import {
  DEMO_CATEGORIES,
  type ConversationTurn,
  type DraftUserIntent,
} from "../domain-types.js";
import { getOpenAiClient } from "../openai-client.js";

const ExtractionOutputSchema = z.object({
  query: z.string(),
  productQuery: z.string(),
  categoryCandidates: z.array(z.enum(DEMO_CATEGORIES)).max(2),
  budgetMax: z.number().positive().nullable(),
  currency: z.string().nullable(),
  requiredAttributes: z.array(z.object({ key: z.string(), value: z.string() })),
  deliveryDeadline: z.string().nullable(),
  scheduleDeadline: z.string().nullable(),
  quantity: z.number().int().positive().nullable(),
  isContinuation: z.boolean(),
});

const SYSTEM_PROMPT = `You are the intent-extraction step of a conversational shopping agent for "Visa Commerce". \
Read the full accumulated draft, the recent conversation, and the user's latest message. Return the complete updated draft intent, not a fragment extracted from the latest message alone.

Rules:
- categoryCandidates must only ever contain "electronics" or "professional_services" — these are the only two demo categories this system supports. Return 0 candidates if the message doesn't indicate either. Return both if it is genuinely ambiguous between the two. Return exactly one if it's clear.
- "query" is the full restated need, for logging/display.
- "productQuery" is a SHORT phrase (2-5 words) naming just the product/service itself, for a literal catalog text search — strip out every word about budget, price, currency, deadlines, or quantity, since a real catalog search requires every word in this phrase to literally appear in a product's name/description/attributes, and a stray leftover word like "under" or "2500" will silently match nothing. Example: "I need a video-editing laptop under $2500" → productQuery: "video editing laptop". Example: "noise-cancelling headphones under $150" → productQuery: "noise cancelling headphones".
- requiredAttributes is for a HARD, filterable spec constraint only — a concrete value the user explicitly stated, like a size ("US 9"), a storage capacity ("256GB"), or a color. Use canonical, generic attribute names ("size", "storage", "color") — never a made-up key, never a merchant-specific term.
- Do NOT put a qualitative need, use case, or purpose into requiredAttributes — phrases like "for video editing", "good for gaming", "noise-cancelling", "professional-grade" describe what the product is FOR, not a specific stated spec value, and there is no guarantee any merchant's catalog tags products with that exact phrase or key. That kind of preference belongs only in productQuery/query text for a later reasoning step to judge against each product's real specs — never as a requiredAttributes entry. Example: "video-editing laptop" → requiredAttributes: {} (empty), NOT {"usage": "video editing"} or {"intended_use": "video editing"}. When in doubt, leave requiredAttributes empty rather than inventing a key.
- Only extract a budgetMax if the user stated a number or a clear range (use the upper bound). Do not invent one.
- Do not fabricate deadlines, quantities, or attributes the user did not state or clearly imply.
- A short reply such as "$100", "ideally under $2500", or "one-time" is the expected answer to a prior question. Merge it with the accumulated draft and preserve every compatible established field.
- Set isContinuation to false only when the latest message clearly starts a different category from the accumulated draft. Questions, non-answers, ambiguous replies, and compatible partial details continue the current request. Default to true.
- Do not call any tool and do not recommend a product — this step only extracts structure from language.`;

export interface ExtractIntentInput {
  message: string;
  currentDraft: DraftUserIntent;
  conversationHistory: ConversationTurn[];
}

export interface ExtractIntentResult {
  draftIntent: DraftUserIntent;
  isContinuation: boolean;
}

const MAX_RECENT_TURNS = 12;

export function buildExtractionContext(input: ExtractIntentInput): string {
  const recentTurns = input.conversationHistory
    .slice(-MAX_RECENT_TURNS)
    .map(
      (turn) => `${turn.role === "user" ? "User" : "Agent"}: ${turn.content}`,
    )
    .join("\n");

  return [
    `Accumulated draft intent:\n${JSON.stringify(input.currentDraft)}`,
    recentTurns.length > 0
      ? `Recent conversation:\n${recentTurns}`
      : "Recent conversation: none",
    `Latest user message: ${input.message}`,
  ].join("\n\n");
}

function hasExactlyOneDifferentCategory(
  current: DraftUserIntent,
  extracted: DraftUserIntent,
): boolean {
  const currentCategory =
    current.categoryCandidates.length === 1
      ? current.categoryCandidates[0]
      : undefined;
  const extractedCategory =
    extracted.categoryCandidates.length === 1
      ? extracted.categoryCandidates[0]
      : undefined;
  return (
    currentCategory !== undefined &&
    extractedCategory !== undefined &&
    currentCategory !== extractedCategory
  );
}

/**
 * The model returns a complete draft, but this deterministic merge is a
 * second line of defence against a partial answer accidentally erasing an
 * established field. Reset remains the exception: an explicit different
 * category starts from the newly extracted data.
 */
export function mergeExtractedIntent(
  current: DraftUserIntent,
  extracted: DraftUserIntent,
  _modelSaysContinuation: boolean,
): ExtractIntentResult {
  // The model flag is useful evidence, but reset is too destructive to trust
  // without the concrete different-category signal required by §2.2.
  const isContinuation = !hasExactlyOneDifferentCategory(current, extracted);
  if (!isContinuation) return { draftIntent: extracted, isContinuation: false };

  const currentQuery = current.rawQuery.trim();
  const extractedQuery = extracted.rawQuery.trim();
  const rawQuery =
    currentQuery.length === 0
      ? extractedQuery
      : extractedQuery.length === 0 ||
          currentQuery
            .toLocaleLowerCase("en")
            .includes(extractedQuery.toLocaleLowerCase("en"))
        ? currentQuery
        : extractedQuery
              .toLocaleLowerCase("en")
              .includes(currentQuery.toLocaleLowerCase("en"))
          ? extractedQuery
          : `${currentQuery}; ${extractedQuery}`;

  return {
    isContinuation: true,
    draftIntent: {
      rawQuery,
      productQuery:
        extracted.productQuery.trim().length > 0
          ? extracted.productQuery
          : current.productQuery,
      categoryCandidates:
        extracted.categoryCandidates.length > 0
          ? extracted.categoryCandidates
          : current.categoryCandidates,
      budgetMax: extracted.budgetMax ?? current.budgetMax,
      currency:
        extracted.currency.trim().length > 0
          ? extracted.currency
          : current.currency,
      requiredAttributes: {
        ...current.requiredAttributes,
        ...extracted.requiredAttributes,
      },
      deliveryDeadline: extracted.deliveryDeadline ?? current.deliveryDeadline,
      scheduleDeadline: extracted.scheduleDeadline ?? current.scheduleDeadline,
      quantity:
        extracted.quantity !== 1 || current.quantity === 1
          ? extracted.quantity
          : current.quantity,
    },
  };
}

export async function extractIntent(
  input: ExtractIntentInput,
): Promise<ExtractIntentResult> {
  const client = getOpenAiClient();

  const response = await client.responses.parse({
    model: agentConfig.openaiModel,
    input: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildExtractionContext(input) },
    ],
    text: { format: zodTextFormat(ExtractionOutputSchema, "draft_intent") },
  });

  const parsed = response.output_parsed;
  if (parsed === null) {
    throw new Error("Layer 1 extraction returned no structured output.");
  }

  const extracted: DraftUserIntent = {
    rawQuery: parsed.query,
    productQuery: parsed.productQuery,
    categoryCandidates: parsed.categoryCandidates,
    budgetMax: parsed.budgetMax ?? undefined,
    currency: parsed.currency ?? "SGD",
    requiredAttributes: Object.fromEntries(
      parsed.requiredAttributes.map(({ key, value }) => [key, value]),
    ),
    deliveryDeadline: parsed.deliveryDeadline ?? undefined,
    scheduleDeadline: parsed.scheduleDeadline ?? undefined,
    quantity: parsed.quantity ?? 1,
  };
  return mergeExtractedIntent(
    input.currentDraft,
    extracted,
    parsed.isContinuation,
  );
}
