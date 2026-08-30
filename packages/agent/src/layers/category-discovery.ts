import {
  resolveCategory,
  type ListCategories,
} from "../category-resolution.js";
import {
  DEMO_CATEGORIES,
  type DemoCategory,
  type DraftUserIntent,
} from "../domain-types.js";
import { buildRealIntent } from "../mcp/build-real-intent.js";
import { callCommerceTool, withCommerceMcpClient } from "../mcp/mcp-client.js";
import { composeCommerceSummary } from "../offer-summary.js";

interface RealSearchProduct {
  productId: string;
  merchantName: string;
  productName: string;
  brand: string | null;
  categoryId: string;
  commerceDomain: "retail_goods" | "services_subscriptions" | "bookings";
  listedPrice: number;
  currency: string;
  matchedAttributes: Record<string, string | number | boolean>;
  images?: string[];
}

export interface DirectionCard {
  productId: string;
  category: DemoCategory;
  name: string;
  description: string;
  images?: string[];
}

export interface ProvisionalShortlistItem {
  productId: string;
  name: string;
  summary: string;
  images?: string[];
}

/**
 * AGENT_SPEC.md §5 Layer 3 Mode 2b. Per §4, the model is not handed MCP
 * tools until Layer 2 has certified the intent complete — this runs before
 * that point, so TIM's backend calls the real search_products tool directly
 * (mcp-client.ts) rather than through agentic tool-orchestration, then hands
 * only the already-fetched real results to a no-tool LLM call for copy.
 */
export async function runCategoryDiscovery(
  draft: DraftUserIntent,
  listCategories: ListCategories,
): Promise<DirectionCard[]> {
  const candidates: DemoCategory[] =
    draft.categoryCandidates.length === 2
      ? draft.categoryCandidates
      : [...DEMO_CATEGORIES];

  const perCategoryResults = await withCommerceMcpClient(async (client) => {
    const results: Array<{
      category: DemoCategory;
      products: RealSearchProduct[];
    }> = [];
    for (const category of candidates.slice(0, 2)) {
      const resolvedCategory = await resolveCategory(
        category,
        draft.productQuery,
        listCategories,
      );
      const intent = buildRealIntent(draft, resolvedCategory);
      const data = await callCommerceTool<{ products: RealSearchProduct[] }>(
        client,
        "search_products",
        { intent },
      );
      results.push({ category, products: data.products });
    }
    return results;
  });

  const candidateProducts = perCategoryResults.flatMap(
    ({ category, products }) =>
      products.slice(0, 2).map((product) => ({ category, product })),
  );

  if (candidateProducts.length === 0) return [];

  return candidateProducts.slice(0, 3).map(({ category, product }) => {
    const directionCard: DirectionCard = {
      productId: product.productId,
      category,
      name: product.productName,
      description: composeCommerceSummary({
        productName: product.productName,
        merchantName: product.merchantName,
        price: product.listedPrice,
        currency: product.currency,
        attributes: product.matchedAttributes,
        commerceDomain: product.commerceDomain,
      }),
    };
    if (product.images !== undefined) directionCard.images = product.images;
    return directionCard;
  });
}

/** Mode 2a's non-blocking, real-data starting point. */
export async function runProvisionalShortlist(
  draft: DraftUserIntent,
  category: DemoCategory,
  listCategories: ListCategories,
): Promise<ProvisionalShortlistItem[]> {
  const resolvedCategory = await resolveCategory(
    category,
    draft.productQuery,
    listCategories,
  );
  const intent = buildRealIntent(draft, resolvedCategory);
  const data = await withCommerceMcpClient((client) =>
    callCommerceTool<{ products: RealSearchProduct[] }>(
      client,
      "search_products",
      { intent },
    ),
  );

  return data.products.slice(0, 3).map((product) => ({
    productId: product.productId,
    name: product.productName,
    summary: composeCommerceSummary({
      productName: product.productName,
      merchantName: product.merchantName,
      price: product.listedPrice,
      currency: product.currency,
      attributes: product.matchedAttributes,
      commerceDomain: product.commerceDomain,
    }),
    images: product.images,
  }));
}
