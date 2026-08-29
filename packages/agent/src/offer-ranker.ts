import type { Offer } from "@visa-commerce/contracts";

export interface OfferRanker {
  rank(offers: Offer[]): Promise<Offer[]>;
}
