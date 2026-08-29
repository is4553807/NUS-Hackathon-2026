import type {
  Offer,
  PaymentResult,
  UserIntent,
} from "@visa-commerce/contracts";

export interface CommerceAgent {
  collectIntent(message: string): Promise<UserIntent>;
  rankOffers(offers: Offer[]): Promise<Offer[]>;
  presentPaymentResult(result: PaymentResult): Promise<string>;
}
