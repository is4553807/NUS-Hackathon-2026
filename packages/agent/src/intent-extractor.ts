import type { UserIntent } from "@visa-commerce/contracts";

export interface IntentExtractor {
  extract(message: string): Promise<UserIntent>;
}
