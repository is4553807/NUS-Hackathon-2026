import type { CatalogCategory, ListCategories } from "./category-resolution.js";

export interface CategoryAttributeSchema {
  attributes: Record<string, { aliases?: string[] }>;
}

/** Injected by the caller (apps/api), same pattern as ListCategories — keeps
 * this package free of any direct Postgres dependency (CLAUDE.md rule 11). */
export type GetCategorySchema = (categoryId: string) => Promise<CategoryAttributeSchema | null>;

function normalizeKey(value: string): string {
  return value.toLocaleLowerCase("en").replaceAll(/[^a-z0-9]+/g, "");
}

function collectKnownNames(schema: CategoryAttributeSchema, into: Set<string>): void {
  for (const [name, definition] of Object.entries(schema.attributes)) {
    into.add(normalizeKey(name));
    for (const alias of definition.aliases ?? []) {
      into.add(normalizeKey(alias));
    }
  }
}

/**
 * When resolveCategory couldn't confidently match a specific subcategory
 * (categoryId === null, e.g. a brand name like "iPhone" that isn't a
 * category name), there is no single schema to validate against — instead
 * this unions the attribute names declared across every category actually
 * seeded in that commerceDomain, so a real stated spec ("storage") is never
 * dropped just because the category couldn't be pinned down, while a
 * fabricated key still has nothing real to match against.
 */
async function knownNamesForDomain(
  commerceDomain: CatalogCategory["commerceDomain"],
  listCategories: ListCategories,
  getCategorySchema: GetCategorySchema,
): Promise<Set<string>> {
  const categories = await listCategories();
  const inDomain = categories.filter((c) => c.commerceDomain === commerceDomain);
  const schemas = await Promise.all(inDomain.map((c) => getCategorySchema(c.categoryId)));
  const known = new Set<string>();
  for (const schema of schemas) {
    if (schema !== null) collectKnownNames(schema, known);
  }
  return known;
}

/**
 * CLAUDE.md rule 8: no fixed, hardcoded list of "important attributes" —
 * this instead validates Layer 1's extracted requiredAttributes against
 * whatever the real, live category schema for the resolved category
 * actually declares (packages/commerce CategorySchema, seeded per category).
 *
 * This exists because the extraction LLM (layers/extract-intent.ts) will,
 * despite explicit prompt instructions, sometimes still turn a qualitative
 * phrase like "video-editing laptop" into a fabricated hard-filter key such
 * as "intended_use" or "purpose" — a key no merchant's catalog was ever
 * seeded with. Left unchecked, that silently zeroes out every real offer
 * server-side (packages/commerce/src/catalog/search.ts requires an exact
 * attribute match) — confirmed by live testing against the real MCP server.
 * Dropping unrecognized keys here, against the real schema, is what makes
 * the hard filter (hard-filter.ts) and the search request agree, and keeps
 * "hard constraints are never LLM-decided" true even when the LLM invents one.
 */
export async function sanitizeRequiredAttributes(
  category: { commerceDomain: CatalogCategory["commerceDomain"]; categoryId: string | null },
  requiredAttributes: Record<string, string>,
  listCategories: ListCategories,
  getCategorySchema: GetCategorySchema,
): Promise<Record<string, string>> {
  if (Object.keys(requiredAttributes).length === 0) return requiredAttributes;

  let knownNames: Set<string>;
  if (category.categoryId !== null) {
    knownNames = new Set<string>();
    const schema = await getCategorySchema(category.categoryId);
    if (schema !== null) collectKnownNames(schema, knownNames);
  } else {
    knownNames = await knownNamesForDomain(category.commerceDomain, listCategories, getCategorySchema);
  }

  return Object.fromEntries(
    Object.entries(requiredAttributes).filter(([key]) => knownNames.has(normalizeKey(key))),
  );
}
