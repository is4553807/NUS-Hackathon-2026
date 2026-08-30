import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { DemoCategory, DraftUserIntent, Mode, ResolvedUserIntent } from "../domain-types.js";

interface RequiredFieldsConfig {
  [category: string]: { required: string[] };
}

let cachedConfig: RequiredFieldsConfig | undefined;

function loadRequiredFieldsConfig(): RequiredFieldsConfig {
  if (cachedConfig !== undefined) return cachedConfig;
  const path = fileURLToPath(
    new URL("../../../../local-config/required-fields.json", import.meta.url),
  );
  cachedConfig = JSON.parse(readFileSync(path, "utf8")) as RequiredFieldsConfig;
  return cachedConfig;
}

function fieldValue(intent: DraftUserIntent, field: string): unknown {
  return (intent as unknown as Record<string, unknown>)[field];
}

function missingRequiredFields(category: DemoCategory, intent: DraftUserIntent): string[] {
  const config = loadRequiredFieldsConfig();
  const required = config[category]?.required ?? [];
  return required.filter((field) => fieldValue(intent, field) === undefined);
}

function toResolvedIntent(category: DemoCategory, intent: DraftUserIntent): ResolvedUserIntent {
  if (intent.budgetMax === undefined) {
    throw new Error("Cannot resolve an intent without budgetMax.");
  }
  return {
    ...intent,
    category,
    budgetMax: intent.budgetMax,
  } as ResolvedUserIntent;
}

/**
 * AGENT_SPEC.md §5 Layer 2: pure, deterministic, no LLM call. This is the
 * only place a ResolvedUserIntent (the branded type tool-turn.ts requires)
 * can be constructed, and it only happens on the "directed" branch — see
 * domain-types.ts for why that structurally blocks tool access before Mode 1.
 */
export function resolveMode(intent: DraftUserIntent): Mode {
  if (intent.categoryCandidates.length === 0 || intent.categoryCandidates.length === 2) {
    return { mode: "category_discovery" };
  }

  const category = intent.categoryCandidates[0];
  if (category === undefined) {
    return { mode: "category_discovery" };
  }
  const missingFields = missingRequiredFields(category, intent);
  if (missingFields.length > 0) {
    return { mode: "attribute_discovery", category, missingFields };
  }

  return { mode: "directed", intent: toResolvedIntent(category, intent) };
}
