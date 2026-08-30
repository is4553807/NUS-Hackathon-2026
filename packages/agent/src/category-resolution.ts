import type { AgentCategory } from "./domain-types.js";

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
  commerceDomain: CatalogCategory["commerceDomain"];
  /** Exact canonical category selected from the live Merchant catalog. */
  categoryId: string | null;
  /** Canonical fallback used only after a literal product query returns no
   * results. It preserves every hard constraint while searching by the real
   * category name instead. */
  broadCategoryId: string | null;
  broadQuery: string;
}

export async function resolveCategory(
  agentCategory: AgentCategory,
  query: string,
  listCategories: ListCategories,
): Promise<ResolvedCategory> {
  const categories = await listCategories();
  const normalizedCategory = normalize(agentCategory);
  const explicitlySelected = categories.find(
    (category) =>
      category.categoryId === agentCategory ||
      [category.name, category.slug, ...category.aliases].some(
        (candidate) => normalize(candidate) === normalizedCategory,
      ),
  );

  const tokens = normalize(query).split(" ").filter(Boolean);
  const matches = categories
    .filter((category) => categoryMatchesQuery(category, tokens))
    .sort((a, b) => b.level - a.level);

  const best = explicitlySelected ?? matches[0];
  if (best === undefined) {
    throw new Error(`The category "${agentCategory}" is not available.`);
  }

  return {
    commerceDomain: best.commerceDomain,
    categoryId: best.categoryId,
    broadCategoryId: best.categoryId,
    broadQuery: best.name,
  };
}
