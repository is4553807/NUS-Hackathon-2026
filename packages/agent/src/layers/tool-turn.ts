import { randomUUID } from "node:crypto";

import {
  sanitizeRequiredAttributes,
  type GetCategorySchema,
} from "../attribute-validation.js";
import {
  resolveCategory,
  type ListCategories,
} from "../category-resolution.js";
import type { RealOffer, ResolvedUserIntent } from "../domain-types.js";
import { buildRealIntent } from "../mcp/build-real-intent.js";
import { buildCommerceMcpTool } from "../mcp/commerce-tool.js";
import { extractRequestOffersResult } from "../mcp/extract-offers.js";
import { callCommerceTool, withCommerceMcpClient } from "../mcp/mcp-client.js";
import { runAgenticTurn } from "../mcp/agentic-turn.js";

const SYSTEM_PROMPT = `You are the Layer 4 tool-enabled turn of a conversational shopping agent for "Visa Commerce". \
A complete, already-validated intent is given below as a JSON object. Your only job this turn is to get real, priced offers for it:

1. If you genuinely need more product detail before requesting offers, you may call get_product and/or check_inventory first.
2. Call request_offers exactly once, passing the given intent object verbatim as the "intent" argument — do not invent, omit, or rename any field in it.
3. Do not call create_order or initiate_payment — this turn only gathers offers.
4. Do not make a recommendation in your final text — a separate step will independently decide that from the real offers request_offers returns.`;

export interface ToolTurnResult {
  offers: RealOffer[];
  wasCalled: boolean;
  toolErrorMessage: string | null;
  realIntentId: string;
  /** The intent actually sent to request_offers — its requiredAttributes may
   * have had unrecognized keys dropped (attribute-validation.ts). The hard
   * filter must be re-run against exactly this, not the original, so it
   * never rejects an offer for a constraint that was never actually sent. */
  sanitizedIntent: ResolvedUserIntent;
  broadened: boolean;
}

interface SearchProductsData {
  products: Array<{ productId: string }>;
}

/**
 * AGENT_SPEC.md §4/§5 Layer 4 — the tool-enabled turn (TASKS.md item 5).
 *
 * This is the ONLY function in the codebase that references
 * buildCommerceMcpTool(), and its parameter type is ResolvedUserIntent — a
 * type that domain-types.ts/mode-resolver.ts make impossible to construct
 * except via mode-resolver.ts's "directed" branch (Mode 1). There is
 * therefore no code path that can attach the commerce MCP tool set to a
 * model turn before Layer 2 has certified the intent complete: doing so
 * would require calling this function without a ResolvedUserIntent, which
 * does not typecheck, let alone run.
 */
export async function runToolEnabledTurn(
  intent: ResolvedUserIntent,
  listCategories: ListCategories,
  getCategorySchema: GetCategorySchema,
): Promise<ToolTurnResult> {
  const resolvedCategory = await resolveCategory(
    intent.category,
    intent.productQuery,
    listCategories,
  );
  const sanitizedAttributes = await sanitizeRequiredAttributes(
    resolvedCategory,
    intent.requiredAttributes,
    listCategories,
    getCategorySchema,
  );
  const sanitizedIntent: ResolvedUserIntent = {
    ...intent,
    requiredAttributes: sanitizedAttributes,
  };

  const realIntentId = randomUUID();
  const realIntent = buildRealIntent(sanitizedIntent, resolvedCategory, {
    intentId: realIntentId,
    budgetMax: sanitizedIntent.budgetMax,
  });

  const response = await runAgenticTurn({
    systemPrompt: SYSTEM_PROMPT,
    userContent: `Intent JSON:\n${JSON.stringify(realIntent)}`,
    tool: buildCommerceMcpTool(),
    autoApprove: false,
  });

  const { offers, wasCalled, toolErrorMessage } =
    extractRequestOffersResult(response);
  if (offers.length > 0 || !wasCalled || toolErrorMessage !== null) {
    return {
      offers,
      wasCalled,
      toolErrorMessage,
      realIntentId,
      sanitizedIntent,
      broadened: false,
    };
  }

  // AGENT_SPEC §2.7 / TASKS item 8: a literal, attribute-scoped phrasing can
  // miss an otherwise matching catalog item. Before reporting no inventory,
  // retry once at the resolved category level. Budget, attributes, deadline,
  // quantity, and currency remain byte-for-byte unchanged.
  const broadIntent = {
    ...realIntent,
    intentId: randomUUID(),
    query: resolvedCategory.broadQuery,
    categoryId: resolvedCategory.broadCategoryId,
  };

  try {
    const broadResult = await withCommerceMcpClient(async (client) => {
      const discovery = await callCommerceTool<SearchProductsData>(
        client,
        "search_products",
        {
          intent: broadIntent,
        },
      );
      if (discovery.products.length === 0) return { offers: [] as RealOffer[] };
      return callCommerceTool<{ offers: RealOffer[] }>(
        client,
        "request_offers",
        {
          intent: broadIntent,
        },
      );
    });
    return {
      offers: broadResult.offers,
      wasCalled: true,
      toolErrorMessage: null,
      realIntentId: broadIntent.intentId,
      sanitizedIntent,
      broadened: true,
    };
  } catch (error) {
    return {
      offers: [],
      wasCalled: true,
      toolErrorMessage:
        error instanceof Error
          ? error.message
          : "The broader merchant search did not complete.",
      realIntentId,
      sanitizedIntent,
      broadened: true,
    };
  }
}
