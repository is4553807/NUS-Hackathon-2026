import { OfferStatus as DatabaseOfferStatus, Prisma } from "@visa-commerce/db";
import {
  OfferSchema,
  RequestOffersRequestSchema,
  type Offer,
  type RequestOffersData,
  type RequestOffersRequest,
  type UserIntent,
} from "@visa-commerce/contracts";

import {
  findMatchingProductCandidates,
  type MatchedProductCandidate,
} from "../catalog/search.js";
import { getCommerceDatabase, type CommerceDependencies } from "../database.js";
import { calculateOfferPrice } from "../pricing/index.js";

const DEFAULT_OFFER_TTL_MS = 10 * 60 * 1000;
const PHYSICAL_DELIVERY_MS = 2 * 60 * 60 * 1000;
const PICKUP_READY_MS = 60 * 60 * 1000;

export type DeliveryAssessment = {
  available: boolean;
  estimate: Date | null;
};

export function assessDelivery(
  candidate: Pick<
    MatchedProductCandidate,
    "productKind" | "physicalShippingRequired" | "bookingStartsAt"
  >,
  intent: Pick<UserIntent, "deliveryLocation" | "deliveryDeadline">,
  now: Date,
): DeliveryAssessment {
  let estimate: Date | null = null;

  switch (candidate.productKind) {
    case "physical_good":
      if (
        candidate.physicalShippingRequired === true &&
        intent.deliveryLocation === null
      ) {
        return { available: false, estimate: null };
      }
      estimate = new Date(
        now.getTime() +
          (candidate.physicalShippingRequired === true
            ? PHYSICAL_DELIVERY_MS
            : PICKUP_READY_MS),
      );
      break;
    case "digital_product":
      estimate = new Date(now);
      break;
    case "service":
      estimate = null;
      break;
    case "booking":
      estimate = candidate.bookingStartsAt;
      if (estimate === null || estimate <= now) {
        return { available: false, estimate };
      }
      break;
  }

  if (
    estimate !== null &&
    intent.deliveryDeadline !== null &&
    estimate > new Date(intent.deliveryDeadline)
  ) {
    return { available: false, estimate };
  }

  return { available: true, estimate };
}

type ReadyOffer = {
  candidate: MatchedProductCandidate;
  offeredPrice: number;
  priceExplanation: string;
  deliveryEstimate: Date | null;
};

function prepareOffer(
  candidate: MatchedProductCandidate,
  intent: UserIntent,
  now: Date,
): ReadyOffer | null {
  if (candidate.quantityAvailable < intent.quantity) return null;

  const delivery = assessDelivery(candidate, intent, now);
  if (!delivery.available) return null;

  const price = calculateOfferPrice({
    listedPrice: candidate.listedPrice,
    availableInventory: candidate.quantityAvailable,
    negotiationEnabled: candidate.negotiationEnabled,
    minimumPrice: candidate.minimumPrice,
    maxDiscountPercent: candidate.maxDiscountPercent,
  });

  if (price.offeredPrice > intent.budgetMax) return null;

  return {
    candidate,
    offeredPrice: price.offeredPrice,
    priceExplanation: price.explanation,
    deliveryEstimate: delivery.estimate,
  };
}

export async function requestOffers(
  request: RequestOffersRequest,
  dependencies: CommerceDependencies = {},
): Promise<RequestOffersData> {
  const { intent } = RequestOffersRequestSchema.parse(request);
  const now = dependencies.now?.() ?? new Date();
  const expiresAt = new Date(
    now.getTime() + (dependencies.offerTtlMs ?? DEFAULT_OFFER_TTL_MS),
  );
  const candidates = await findMatchingProductCandidates(intent, dependencies);
  const readyOffers = candidates
    .map((candidate) => prepareOffer(candidate, intent, now))
    .filter((offer): offer is ReadyOffer => offer !== null);
  const database = getCommerceDatabase(dependencies);

  const offers = await database.$transaction(async (transaction) => {
    await transaction.offer.updateMany({
      where: {
        intentId: intent.intentId,
        status: DatabaseOfferStatus.ACTIVE,
      },
      data: { status: DatabaseOfferStatus.CANCELLED },
    });

    const createdOffers: Offer[] = [];
    for (const readyOffer of readyOffers) {
      const { candidate } = readyOffer;
      const created = await transaction.offer.create({
        data: {
          intentId: intent.intentId,
          merchantId: candidate.merchantId,
          productId: candidate.productId,
          variantId: candidate.variantId,
          attributes: candidate.matchedAttributes as Prisma.InputJsonObject,
          listedPrice: candidate.listedPrice,
          offeredPrice: readyOffer.offeredPrice,
          currency: candidate.currency,
          quantity: intent.quantity,
          deliveryAvailable: true,
          deliveryEstimate: readyOffer.deliveryEstimate,
          priceExplanation: readyOffer.priceExplanation,
          status: DatabaseOfferStatus.ACTIVE,
          expiresAt,
        },
      });

      createdOffers.push(
        OfferSchema.parse({
          offerId: created.id,
          intentId: created.intentId,
          merchantId: created.merchantId,
          merchantName: candidate.merchantName,
          productId: created.productId,
          productName: candidate.productName,
          variantId: created.variantId,
          commerceDomain: candidate.commerceDomain,
          categoryId: candidate.categoryId,
          listedPrice: created.listedPrice.toNumber(),
          offeredPrice: created.offeredPrice.toNumber(),
          currency: "SGD",
          quantity: created.quantity,
          quantityAvailable: candidate.quantityAvailable,
          attributes: candidate.matchedAttributes,
          deliveryAvailable: created.deliveryAvailable,
          deliveryEstimate: created.deliveryEstimate?.toISOString() ?? null,
          status: "active",
          expiresAt: created.expiresAt.toISOString(),
          priceExplanation: created.priceExplanation,
        }),
      );
    }

    return createdOffers;
  });

  return { offers };
}
