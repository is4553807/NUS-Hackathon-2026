import {
  resolveCategory,
  type CatalogCategory,
  type ListCategories,
} from "../category-resolution.js";
import type { AgentCategory, DraftUserIntent } from "../domain-types.js";
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
  category: AgentCategory;
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

function normalize(value: string): string {
  return value
    .toLocaleLowerCase("en")
    .replaceAll(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function categoryRelevance(category: CatalogCategory, query: string): number {
  const categoryText = normalize(
    [
      category.categoryId,
      category.name,
      category.slug,
      ...category.aliases,
    ].join(" "),
  );
  return normalize(query)
    .split(" ")
    .filter((token) => token.length > 2 && categoryText.includes(token)).length;
}

/** Selects at most three real categories for ambiguous discovery. Explicit
 * model candidates win; otherwise matching catalog metadata is preferred,
 * followed by a domain-diverse fallback for a truly open-ended request. */
export function selectDiscoveryCategories(
  draft: DraftUserIntent,
  categories: CatalogCategory[],
): AgentCategory[] {
  if (draft.categoryCandidates.length > 0) {
    const validIds = new Set(categories.map((category) => category.categoryId));
    return draft.categoryCandidates
      .filter((categoryId) => validIds.has(categoryId))
      .slice(0, 3);
  }

  const ranked = categories
    .map((category) => ({
      category,
      score: categoryRelevance(category, draft.productQuery),
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || b.category.level - a.category.level);
  if (ranked.length > 0) {
    return ranked.slice(0, 3).map(({ category }) => category.categoryId);
  }

  const selected: CatalogCategory[] = [];
  for (const commerceDomain of [
    "retail_goods",
    "services_subscriptions",
    "bookings",
  ] as const) {
    const category = categories.find(
      (candidate) => candidate.commerceDomain === commerceDomain,
    );
    if (category !== undefined) selected.push(category);
  }
  return selected.slice(0, 3).map((category) => category.categoryId);
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
  const categories = await listCategories();
  const candidates = selectDiscoveryCategories(draft, categories);
  const listCachedCategories: ListCategories = async () => categories;

  const perCategoryResults = await withCommerceMcpClient(async (client) => {
    const results: Array<{
      category: AgentCategory;
      products: RealSearchProduct[];
    }> = [];
    for (const category of candidates) {
      const resolvedCategory = await resolveCategory(
        category,
        draft.productQuery,
        listCachedCategories,
      );
      const intent = buildRealIntent(
        {
          ...draft,
          productQuery:
            draft.productQuery.trim().length > 0
              ? draft.productQuery
              : resolvedCategory.broadQuery,
        },
        resolvedCategory,
      );
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
  category: AgentCategory,
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
