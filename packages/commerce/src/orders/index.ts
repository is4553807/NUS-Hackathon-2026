import {
  MerchantStatus,
  OfferStatus,
  OrderStatus as DatabaseOrderStatus,
  Prisma,
  ProductKind,
} from "@visa-commerce/db";
import {
  OrderRequestSchema,
  type OrderRequest,
  type OrderResult,
  type OrderStatus,
} from "@visa-commerce/contracts";

import { getCommerceDatabase, type CommerceDependencies } from "../database.js";
import { CommerceError, throwNotFound } from "../errors.js";
import {
  calculateAvailableQuantity,
  deriveInventoryAvailability,
} from "../inventory/index.js";
import { calculateOfferPrice } from "../pricing/index.js";
import { roundMoney } from "../validation.js";

const MAX_CONFIRMATION_FUTURE_MS = 5 * 60 * 1000;

const orderStatusMap: Record<DatabaseOrderStatus, OrderStatus> = {
  PAYMENT_PENDING: "payment_pending",
  PAID: "paid",
  PAYMENT_FAILED: "payment_failed",
  CANCELLED: "cancelled",
};

type StoredOrder = {
  id: string;
  requestId: string;
  userId: string;
  merchantId: string;
  offerId: string;
  productId: string;
  quantity: number;
  unitPrice: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
  currency: string;
  userConfirmed: boolean;
  status: DatabaseOrderStatus;
  createdAt: Date;
};

export type OrderRevalidationInput = {
  offerId: string;
  offerStatus: OfferStatus;
  expiresAt: Date;
  now: Date;
  productActive: boolean;
  merchantActive: boolean;
  deliveryAvailable: boolean;
  bookingStartsAt: Date | null;
  quantityRequested: number;
  quantityAvailable: number;
  originalListedPrice: number;
  currentListedPrice: number;
  originalOfferedPrice: number;
  currentOfferedPrice: number;
};

function orderFailure(options: {
  code:
    | "OFFER_EXPIRED"
    | "OUT_OF_STOCK"
    | "DELIVERY_UNAVAILABLE"
    | "PRICE_CHANGED"
    | "ORDER_CONFLICT";
  message: string;
  offerId: string;
  retryable?: boolean;
}): never {
  throw new CommerceError({
    code: options.code,
    message: options.message,
    retryable: options.retryable ?? false,
    details: { offerId: options.offerId },
  });
}

export function validateOrderRevalidation(input: OrderRevalidationInput): void {
  if (
    input.offerStatus === OfferStatus.EXPIRED ||
    input.expiresAt <= input.now
  ) {
    orderFailure({
      code: "OFFER_EXPIRED",
      message: "The offer has expired.",
      offerId: input.offerId,
    });
  }

  if (input.offerStatus !== OfferStatus.ACTIVE) {
    orderFailure({
      code: "ORDER_CONFLICT",
      message: "The offer is no longer active.",
      offerId: input.offerId,
    });
  }

  if (!input.productActive || !input.merchantActive) {
    orderFailure({
      code: "ORDER_CONFLICT",
      message: "The product is no longer available.",
      offerId: input.offerId,
    });
  }

  if (
    !input.deliveryAvailable ||
    (input.bookingStartsAt !== null && input.bookingStartsAt <= input.now)
  ) {
    orderFailure({
      code: "DELIVERY_UNAVAILABLE",
      message: "The fulfillment option is no longer available.",
      offerId: input.offerId,
    });
  }

  if (input.quantityAvailable < input.quantityRequested) {
    orderFailure({
      code: "OUT_OF_STOCK",
      message: "The requested quantity is no longer available.",
      offerId: input.offerId,
      retryable: true,
    });
  }

  if (
    roundMoney(input.currentListedPrice) !==
      roundMoney(input.originalListedPrice) ||
    roundMoney(input.currentOfferedPrice) !==
      roundMoney(input.originalOfferedPrice)
  ) {
    orderFailure({
      code: "PRICE_CHANGED",
      message: "The price changed and requires confirmation again.",
      offerId: input.offerId,
    });
  }
}

export function validateConfirmationTime(confirmedAt: string, now: Date): Date {
  const confirmationTime = new Date(confirmedAt);

  if (confirmationTime.getTime() > now.getTime() + MAX_CONFIRMATION_FUTURE_MS) {
    throw new CommerceError({
      code: "VALIDATION_ERROR",
      message: "confirmedAt is unreasonably far in the future.",
      details: { field: "confirmedAt" },
    });
  }

  return confirmationTime;
}

function toOrderResult(order: StoredOrder): OrderResult {
  if (!order.userConfirmed) {
    throw new CommerceError({
      code: "CONFIRMATION_REQUIRED",
      message: "Explicit user confirmation is required.",
    });
  }

  return {
    orderId: order.id,
    offerId: order.offerId,
    userId: order.userId,
    merchantId: order.merchantId,
    productId: order.productId,
    quantity: order.quantity,
    unitPrice: order.unitPrice.toNumber(),
    totalAmount: order.totalAmount.toNumber(),
    currency: "SGD",
    userConfirmed: true,
    status: orderStatusMap[order.status],
    createdAt: order.createdAt.toISOString(),
  };
}

function resolveIdempotentOrder(
  order: StoredOrder,
  request: OrderRequest,
): OrderResult {
  if (order.offerId !== request.offerId || order.userId !== request.userId) {
    throw new CommerceError({
      code: "ORDER_CONFLICT",
      message: "requestId was already used for a different order.",
      details: { requestId: request.requestId },
    });
  }

  return toOrderResult(order);
}

export async function createOrder(
  input: OrderRequest,
  dependencies: CommerceDependencies = {},
): Promise<OrderResult> {
  const request = OrderRequestSchema.parse(input);
  const database = getCommerceDatabase(dependencies);
  const now = dependencies.now?.() ?? new Date();
  const confirmedAt = validateConfirmationTime(request.confirmedAt, now);
  const existingOrder = await database.order.findUnique({
    where: { requestId: request.requestId },
  });

  if (existingOrder !== null) {
    return resolveIdempotentOrder(existingOrder, request);
  }

  try {
    return await database.$transaction(async (transaction) => {
      const transactionOrder = await transaction.order.findUnique({
        where: { requestId: request.requestId },
      });
      if (transactionOrder !== null) {
        return resolveIdempotentOrder(transactionOrder, request);
      }

      const offer = await transaction.offer.findUnique({
        where: { id: request.offerId },
        include: {
          variant: { include: { inventory: true } },
          product: {
            include: {
              merchant: { select: { status: true } },
              pricingPolicy: true,
              bookingExperienceDetails: { select: { startsAt: true } },
            },
          },
        },
      });

      if (offer === null) throwNotFound("Offer", request.offerId);

      const inventory = offer.variant.inventory;

      if (inventory === null) {
        orderFailure({
          code: "OUT_OF_STOCK",
          message: "The offered product variant is no longer available.",
          offerId: offer.id,
          retryable: true,
        });
      }

      const quantityAvailable = calculateAvailableQuantity(
        inventory.quantityAvailable,
        inventory.quantityReserved,
      );
      const currentListedPrice = offer.variant.listedPrice.toNumber();
      let currentOfferedPrice: number;

      try {
        currentOfferedPrice = calculateOfferPrice({
          listedPrice: currentListedPrice,
          availableInventory: quantityAvailable,
          negotiationEnabled:
            offer.product.pricingPolicy?.negotiationEnabled ?? false,
          minimumPrice:
            offer.product.pricingPolicy?.minimumPrice?.toNumber() ?? null,
          maxDiscountPercent:
            offer.product.pricingPolicy?.maxDiscountPercent?.toNumber() ?? null,
        }).offeredPrice;
      } catch {
        orderFailure({
          code: "PRICE_CHANGED",
          message:
            "The pricing policy changed and requires confirmation again.",
          offerId: offer.id,
        });
      }

      validateOrderRevalidation({
        offerId: offer.id,
        offerStatus: offer.status,
        expiresAt: offer.expiresAt,
        now,
        productActive: offer.product.active,
        merchantActive: offer.product.merchant.status === MerchantStatus.ACTIVE,
        deliveryAvailable: offer.deliveryAvailable,
        bookingStartsAt:
          offer.product.productKind === ProductKind.BOOKING
            ? (offer.product.bookingExperienceDetails?.startsAt ?? null)
            : null,
        quantityRequested: offer.quantity,
        quantityAvailable,
        originalListedPrice: offer.listedPrice.toNumber(),
        currentListedPrice,
        originalOfferedPrice: offer.offeredPrice.toNumber(),
        currentOfferedPrice,
      });

      const claimedOffer = await transaction.offer.updateMany({
        where: {
          id: offer.id,
          status: OfferStatus.ACTIVE,
          expiresAt: { gt: now },
        },
        data: { status: OfferStatus.ACCEPTED },
      });

      if (claimedOffer.count !== 1) {
        orderFailure({
          code: "ORDER_CONFLICT",
          message: "The offer was accepted by another order.",
          offerId: offer.id,
        });
      }

      const nextReservedQuantity = inventory.quantityReserved + offer.quantity;
      const reservedInventory = await transaction.inventory.updateMany({
        where: {
          id: inventory.id,
          quantityReserved: inventory.quantityReserved,
          quantityAvailable: { gte: nextReservedQuantity },
        },
        data: {
          quantityReserved: { increment: offer.quantity },
          availability: deriveInventoryAvailability(
            inventory.quantityAvailable,
            nextReservedQuantity,
          ),
        },
      });

      if (reservedInventory.count !== 1) {
        orderFailure({
          code: "OUT_OF_STOCK",
          message: "Inventory changed while the order was being created.",
          offerId: offer.id,
          retryable: true,
        });
      }

      const order = await transaction.order.create({
        data: {
          requestId: request.requestId,
          userId: request.userId,
          merchantId: offer.merchantId,
          offerId: offer.id,
          productId: offer.productId,
          quantity: offer.quantity,
          unitPrice: offer.offeredPrice,
          totalAmount: roundMoney(
            offer.offeredPrice.toNumber() * offer.quantity,
          ),
          currency: offer.currency,
          userConfirmed: request.userConfirmed,
          confirmedAt,
          confirmationChannel: request.confirmationChannel,
          status: DatabaseOrderStatus.PAYMENT_PENDING,
        },
      });

      return toOrderResult(order);
    });
  } catch (error) {
    const racedOrder = await database.order.findUnique({
      where: { requestId: request.requestId },
    });

    if (racedOrder !== null) {
      return resolveIdempotentOrder(racedOrder, request);
    }

    throw error;
  }
}
