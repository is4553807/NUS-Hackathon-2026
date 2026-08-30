import { zodTextFormat } from "openai/helpers/zod.js";
import { z } from "zod";

import { agentConfig } from "../config.js";
import type { ComparisonResult, DemoCategory, RealOffer } from "../domain-types.js";
import { getOpenAiClient } from "../openai-client.js";

const DecisionOutputSchema = z.object({
  selectedOfferId: z.string().nullable(),
  reasoning: z.string(),
  rejectedOffers: z.array(z.object({ offerId: z.string(), reason: z.string() })),
  askClarifyingQuestion: z.string().nullable(),
});

/**
 * AGENT_SPEC.md §6 Step B, branched by category. Electronics reasons over
 * the offer's structured `attributes` spec bag. professional_services has
 * no dedicated `description`/`durationType` field on the real live Offer
 * contract (packages/contracts/src/offer.ts) — by explicit product
 * direction, its `attributes` bag stands in for that descriptive text, read
 * alongside productName and price.
 */
function systemPromptFor(category: DemoCategory): string {
  const shared = `You are the final-decision step of a conversational shopping agent. \
You are given the user's stated need and a fixed set of real, already budget/feature/deadline/availability-filtered offers — this set is authoritative and complete; do not consider anything outside it, and never invent an offer, price, or attribute. \
Judge each offer primarily by how well it actually serves the user's stated need, not just by which offer looks generically "better" — an offer that is cheaper or has more features is still wrong if it is a different kind of product/service than what the user asked for. \
Pick exactly one winning offerId unless the offers are genuinely tied on every dimension that matters, in which case set askClarifyingQuestion to one short question about a real attribute the offers actually differ on (never a generic or invented one) and leave selectedOfferId null. \
For every offer you do not select, give a specific, plain-language reason grounded in its real data — never a generic "rejected".`;

  if (category === "electronics") {
    return `${shared}\nReason primarily over each offer's structured "attributes" bag (specs) and price.`;
  }
  return `${shared}\nReason primarily over each offer's "attributes" bag (which carries its descriptive/service details), its productName, and price — treat "attributes" as the offer's description for this category.`;
}

export interface FinalDecisionInput {
  category: DemoCategory;
  /** The user's original stated need (AGENT_SPEC.md §6 Step B: "semantic matching") — without this, two offers that both survive the hard filter but serve different purposes are indistinguishable, and the decision degenerates into an arbitrary pick. */
  userQuery: string;
  offers: RealOffer[];
  userAnswer?: string;
  /** false once a clarifying question has already been asked and answered — the model must decide now. */
  allowClarification: boolean;
}

async function callDecision(input: FinalDecisionInput, forceDecision: boolean) {
  const client = getOpenAiClient();
  const response = await client.responses.parse({
    model: agentConfig.openaiModel,
    temperature: 0,
    input: [
      { role: "system", content: systemPromptFor(input.category) },
      {
        role: "user",
        content:
          `User's stated need: ${input.userQuery}\n\n` +
          `Offers:\n${JSON.stringify(input.offers)}` +
          (input.userAnswer !== undefined ? `\n\nUser's answer to the clarifying question: ${input.userAnswer}` : "") +
          (forceDecision
            ? "\n\nYou must return a final selectedOfferId now — do not ask another clarifying question."
            : ""),
      },
    ],
    text: { format: zodTextFormat(DecisionOutputSchema, "final_decision") },
  });
  return response.output_parsed;
}

/**
 * CLAUDE.md rule 4: temperature 0, structured output only, grounded strictly
 * to the offers actually passed in (which the caller must have already run
 * through hard-filter.ts — this function never re-derives or trusts an
 * offer it wasn't handed).
 */
export async function runFinalDecision(input: FinalDecisionInput): Promise<ComparisonResult> {
  const validIds = new Set(input.offers.map((offer) => offer.offerId));

  let parsed = await callDecision(input, !input.allowClarification);
  if (parsed === null) throw new Error("Step B final-decision call returned no output.");

  if (!input.allowClarification && parsed.askClarifyingQuestion !== null) {
    // AGENT_SPEC.md §5 Step C: one question max. A second pass must return a
    // final decision — retry once with a stronger instruction, then fall
    // back to a deterministic pick rather than ever asking a second question.
    parsed = (await callDecision(input, true)) ?? parsed;
  }

  if (!input.allowClarification && parsed.askClarifyingQuestion !== null) {
    const cheapest = [...input.offers].sort((a, b) => a.offeredPrice - b.offeredPrice)[0];
    if (cheapest === undefined) throw new Error("Step B called with no offers.");
    return {
      selectedOfferId: cheapest.offerId,
      reasoning: "Offers remained tied after clarification; selected the lowest-price option deterministically.",
      rejectedOffers: input.offers
        .filter((offer) => offer.offerId !== cheapest.offerId)
        .map((offer) => ({ offerId: offer.offerId, reason: "Tied with the selected offer; lowest price chosen as the deterministic tiebreak." })),
      askClarifyingQuestion: null,
    };
  }

  if (parsed.askClarifyingQuestion !== null) {
    return {
      selectedOfferId: "",
      reasoning: parsed.reasoning,
      rejectedOffers: parsed.rejectedOffers,
      askClarifyingQuestion: parsed.askClarifyingQuestion,
    };
  }

  // Independent, deterministic re-check (CLAUDE.md rule 2): the model's
  // selection is never trusted on its own — it must reference a real offer
  // from the exact set it was given.
  if (parsed.selectedOfferId === null || !validIds.has(parsed.selectedOfferId)) {
    throw new Error(
      `Step B selected an offerId ("${parsed.selectedOfferId}") that is not in the filtered offer set — rejecting this turn's output.`,
    );
  }

  return {
    selectedOfferId: parsed.selectedOfferId,
    reasoning: parsed.reasoning,
    rejectedOffers: parsed.rejectedOffers,
    askClarifyingQuestion: null,
  };
}
