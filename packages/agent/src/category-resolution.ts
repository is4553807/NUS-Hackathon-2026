import type { DemoCategory } from "./domain-types.js";

/**
 * The Commerce MCP server has no concept of TIM's two demo categories at
 * all — it has a general, real, non-hardcoded category taxonomy (CLAUDE.md
 * rule 8; confirmed against packages/commerce/src/categories/index.ts and
 * the live seed data). Per explicit product direction: "electronics" maps
 * onto the `retail_goods` commerceDomain and "professional_services" maps
 * onto the `services_subscriptions` commerceDomain — they are the same
 * thing under TIM's demo-scope label.
 */
const DOMAIN_BY_DEMO_CATEGORY: Record<
  DemoCategory,
  "retail_goods" | "services_subscriptions"
> = {
  electronics: "retail_goods",
  professional_services: "services_subscriptions",
};

export interface CatalogCategory {
  categoryId: string;
  commerceDomain: "retail_goods" | "services_subscriptions" | "bookings";
  name: string;
  slug: string;
  aliases: string[];
  level: number;
}

/** Injected by the caller (apps/api) — never imported directly by this
 * package, so packages/agent never links against @visa-commerce/db or
 * touches Postgres (CLAUDE.md rule 11). */
export type ListCategories = () => Promise<CatalogCategory[]>;

function normalize(value: string): string {
  return value
    .toLocaleLowerCase("en")
    .replaceAll(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function categoryMatchesQuery(
  category: CatalogCategory,
  tokens: string[],
): boolean {
  const haystack = normalize(
    [category.name, category.slug, ...category.aliases].join(" "),
  );
  return tokens.some((token) => token.length > 2 && haystack.includes(token));
}

export interface ResolvedCategory {
  commerceDomain: "retail_goods" | "services_subscriptions";
  /**
   * null when no specific subcategory's name/slug/aliases matched the
   * query text (e.g. a brand name like "iPhone" that names a product, not
   * a category) — request_offers/search_products treat a null categoryId
   * as "search the whole domain" (packages/commerce/src/catalog/search.ts),
   * which is more correct here than guessing wrong, and keeps this
   * generic rather than a hardcoded product→category map (CLAUDE.md rule 8).
   */
  categoryId: string | null;
  /** Canonical, category-level fallback used only after a specific search
   * returns zero results. Keeping it separate means broadening never changes
   * the user's hard constraints. */
  broadCategoryId: string | null;
  broadQuery: string;
}

export async function resolveCategory(
  demoCategory: DemoCategory,
  query: string,
  listCategories: ListCategories,
): Promise<ResolvedCategory> {
  const commerceDomain = DOMAIN_BY_DEMO_CATEGORY[demoCategory];
  const categories = await listCategories();
  const inDomain = categories.filter(
    (c) => c.commerceDomain === commerceDomain,
  );

  const tokens = normalize(query).split(" ").filter(Boolean);
  const matches = inDomain
    .filter((category) => categoryMatchesQuery(category, tokens))
    .sort((a, b) => b.level - a.level);

  const best = matches[0];
  const demoCategoryName = normalize(demoCategory);
  const broadCategory =
    inDomain.find(
      (category) => normalize(category.name) === demoCategoryName,
    ) ??
    inDomain.find(
      (category) => normalize(category.slug) === demoCategoryName,
    ) ??
    best ??
    inDomain.sort((a, b) => a.level - b.level)[0];

  return {
    commerceDomain,
    categoryId: best?.categoryId ?? null,
    broadCategoryId: broadCategory?.categoryId ?? null,
    broadQuery:
      broadCategory?.name ??
      (demoCategory === "electronics"
        ? "Electronics"
        : "Professional Services"),
  };
}
