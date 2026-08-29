import { createHash } from "node:crypto";

import {
  OrderStatus,
  PaymentStatus as DatabasePaymentStatus,
  type Prisma,
} from "@visa-commerce/db";
import {
  GetPaymentStatusRequestSchema,
  InitiatePaymentRequestSchema,
  PaymentResultSchema,
  type InitiatePaymentRequest,
  type PaymentResult,
} from "@visa-commerce/contracts";

import { getCommerceDatabase, type CommerceDependencies } from "../database.js";
import { CommerceError, throwNotFound } from "../errors.js";
import { deriveInventoryAvailability } from "../inventory/index.js";

type FinalPaymentStatus =
  "requires_verification" | "authorized" | "declined" | "failed";

export type PaymentGatewayDecision = {
  status: FinalPaymentStatus;
  cardholderVerified: boolean;
  authorizationReference: string | null;
  failureCode: string | null;
  failureMessage: string | null;
};

export type PaymentGateway = {
  authorize(input: {
    requestId: string;
    orderId: string;
    amount: number;
    currency: "SGD";
    paymentCredentialReference: string;
  }): Promise<PaymentGatewayDecision>;
};

export type PaymentDependencies = CommerceDependencies & {
  paymentGateway?: PaymentGateway;
};

type StoredPayment = {
  id: string;
  requestId: string;
  orderId: string;
  paymentMethodId: string | null;
  provider: string;
  amount: Prisma.Decimal;
  currency: string;
  paymentTokenFingerprint: string | null;
  cardholderVerified: boolean;
  status: DatabasePaymentStatus;
  authorizationReference: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  updatedAt: Date;
};

type StoredPaymentMethod = {
  id: string;
  userId: string;
  provider: string;
  providerCredentialRef: string;
  cardholderVerified: boolean;
  expiryMonth: number;
  expiryYear: number;
};

const paymentStatusMap = {
  PENDING: "pending",
  REQUIRES_VERIFICATION: "requires_verification",
  AUTHORIZED: "authorized",
  DECLINED: "declined",
  FAILED: "failed",
  CANCELLED: "cancelled",
} as const satisfies Record<DatabasePaymentStatus, PaymentResult["status"]>;

const databasePaymentStatus = {
  requires_verification: DatabasePaymentStatus.REQUIRES_VERIFICATION,
  authorized: DatabasePaymentStatus.AUTHORIZED,
  declined: DatabasePaymentStatus.DECLINED,
  failed: DatabasePaymentStatus.FAILED,
} as const satisfies Record<FinalPaymentStatus, DatabasePaymentStatus>;

function authorizationReference(requestId: string): string {
  return `VISA-DEMO-${requestId.replaceAll("-", "").slice(0, 16).toUpperCase()}`;
}

export function fingerprintPaymentCredential(reference: string): string {
  return createHash("sha256").update(reference, "utf8").digest("hex");
}

export function isPaymentMethodExpired(
  paymentMethod: { expiryMonth: number; expiryYear: number },
  now: Date,
): boolean {
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth() + 1;
  return (
    paymentMethod.expiryYear < currentYear ||
    (paymentMethod.expiryYear === currentYear &&
      paymentMethod.expiryMonth < currentMonth)
  );
}

export function simulateVisaAuthorization(input: {
  requestId: string;
  paymentCredentialReference: string;
}): PaymentGatewayDecision {
  switch (input.paymentCredentialReference) {
    case "vault_mock_visa_authorized":
      return {
        status: "authorized",
        cardholderVerified: true,
        authorizationReference: authorizationReference(input.requestId),
        failureCode: null,
        failureMessage: null,
      };
    case "vault_mock_visa_declined":
      return {
        status: "declined",
        cardholderVerified: true,
        authorizationReference: null,
        failureCode: "PAYMENT_DECLINED",
        failureMessage: "The mock Visa authorization was declined.",
      };
    case "vault_mock_visa_verification":
      return {
        status: "requires_verification",
        cardholderVerified: false,
        authorizationReference: null,
        failureCode: "IDENTITY_VERIFICATION_REQUIRED",
        failureMessage: "Additional mock cardholder verification is required.",
      };
    default:
      return {
        status: "failed",
        cardholderVerified: false,
        authorizationReference: null,
        failureCode: "PAYMENT_FAILED",
        failureMessage: "The mock Visa processor is unavailable.",
      };
  }
}

const mockVisaPaymentGateway: PaymentGateway = {
  async authorize(input) {
    return simulateVisaAuthorization(input);
  },
};

function toPaymentResult(payment: StoredPayment): PaymentResult {
  return PaymentResultSchema.parse({
    orderId: payment.orderId,
    paymentId: payment.id,
    provider: "Visa",
    status: paymentStatusMap[payment.status],
    amount: payment.amount.toNumber(),
    currency: "SGD",
    cardholderVerified: payment.cardholderVerified,
    authorizationReference: payment.authorizationReference,
    failureCode: payment.failureCode,
    failureMessage: payment.failureMessage,
    updatedAt: payment.updatedAt.toISOString(),
  });
}

function paymentConflict(
  message: string,
  details: Record<string, unknown>,
): never {
  throw new CommerceError({
    code: "ORDER_CONFLICT",
    message,
    details,
  });
}

function resolveIdempotentPayment(
  payment: StoredPayment,
  request: InitiatePaymentRequest,
): PaymentResult {
  if (
    payment.orderId !== request.orderId ||
    (request.paymentMethodId != null &&
      payment.paymentMethodId !== request.paymentMethodId)
  ) {
    paymentConflict("requestId was already used for a different payment.", {
      requestId: request.requestId,
    });
  }
  return toPaymentResult(payment);
}

async function findActivePayment(
  orderId: string,
  dependencies: PaymentDependencies,
): Promise<StoredPayment | null> {
  const database = getCommerceDatabase(dependencies);
  return database.payment.findFirst({
    where: {
      orderId,
      status: {
        in: [
          DatabasePaymentStatus.PENDING,
          DatabasePaymentStatus.REQUIRES_VERIFICATION,
          DatabasePaymentStatus.AUTHORIZED,
        ],
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

async function resolvePaymentMethod(
  orderId: string,
  requestedPaymentMethodId: string | null | undefined,
  dependencies: PaymentDependencies,
): Promise<StoredPaymentMethod> {
  const database = getCommerceDatabase(dependencies);
  const order = await database.order.findUnique({
    where: { id: orderId },
    select: { userId: true },
  });
  if (order === null) throwNotFound("Order", orderId);

  const paymentMethod = await database.paymentMethod.findFirst({
    where: {
      userId: order.userId,
      provider: "Visa",
      active: true,
      ...(requestedPaymentMethodId == null
        ? { isDefault: true }
        : { id: requestedPaymentMethodId }),
    },
  });
  if (paymentMethod === null) {
    throwNotFound(
      requestedPaymentMethodId == null
        ? "Default payment method"
        : "Payment method",
      requestedPaymentMethodId ?? order.userId,
    );
  }
  if (
    isPaymentMethodExpired(paymentMethod, dependencies.now?.() ?? new Date())
  ) {
    throw new CommerceError({
      code: "VALIDATION_ERROR",
      message: "The saved payment method has expired.",
      details: { paymentMethodId: paymentMethod.id },
    });
  }
  return paymentMethod;
}

export async function initiatePayment(
  input: InitiatePaymentRequest,
  dependencies: PaymentDependencies = {},
): Promise<PaymentResult> {
  const request = InitiatePaymentRequestSchema.parse(input);
  const database = getCommerceDatabase(dependencies);
  const existing = await database.payment.findUnique({
    where: { requestId: request.requestId },
  });
  if (existing !== null) {
    return resolveIdempotentPayment(existing, request);
  }

  const paymentMethod = await resolvePaymentMethod(
    request.orderId,
    request.paymentMethodId,
    dependencies,
  );
  const credentialFingerprint = fingerprintPaymentCredential(
    paymentMethod.providerCredentialRef,
  );
  let reservation: { payment: StoredPayment; created: boolean };
  try {
    reservation = await database.$transaction(async (transaction) => {
      const transactionExisting = await transaction.payment.findUnique({
        where: { requestId: request.requestId },
      });
      if (transactionExisting !== null) {
        return { payment: transactionExisting, created: false };
      }

      const order = await transaction.order.findUnique({
        where: { id: request.orderId },
        include: { payments: { orderBy: { createdAt: "desc" } } },
      });
      if (order === null) throwNotFound("Order", request.orderId);
      if (!order.userConfirmed) {
        throw new CommerceError({
          code: "CONFIRMATION_REQUIRED",
          message: "Explicit user confirmation is required before payment.",
          details: { orderId: request.orderId },
        });
      }

      const transactionPaymentMethod =
        await transaction.paymentMethod.findFirst({
          where: {
            id: paymentMethod.id,
            userId: order.userId,
            provider: "Visa",
            active: true,
          },
        });
      if (transactionPaymentMethod === null) {
        throwNotFound("Payment method", paymentMethod.id);
      }

      const authorized = order.payments.find(
        (candidate) => candidate.status === DatabasePaymentStatus.AUTHORIZED,
      );
      if (authorized !== undefined) {
        return { payment: authorized, created: false };
      }
      if (order.status !== OrderStatus.PAYMENT_PENDING) {
        paymentConflict("The Order cannot accept a new payment.", {
          orderId: order.id,
          orderStatus: order.status.toLowerCase(),
        });
      }

      const active = order.payments.find(
        (candidate) =>
          candidate.status === DatabasePaymentStatus.PENDING ||
          candidate.status === DatabasePaymentStatus.REQUIRES_VERIFICATION,
      );
      if (active !== undefined) {
        paymentConflict("Another payment is already active for this Order.", {
          orderId: order.id,
          paymentId: active.id,
        });
      }

      const created = await transaction.payment.create({
        data: {
          requestId: request.requestId,
          orderId: order.id,
          paymentMethodId: transactionPaymentMethod.id,
          provider: "Visa",
          amount: order.totalAmount,
          currency: order.currency,
          paymentTokenFingerprint: credentialFingerprint,
          cardholderVerified: false,
          status: DatabasePaymentStatus.PENDING,
        },
      });
      return { payment: created, created: true };
    });
  } catch (error) {
    const raced = await database.payment.findUnique({
      where: { requestId: request.requestId },
    });
    if (raced !== null) {
      return resolveIdempotentPayment(raced, request);
    }
    const active = await findActivePayment(request.orderId, dependencies);
    if (active !== null && active.status === DatabasePaymentStatus.AUTHORIZED) {
      return toPaymentResult(active);
    }
    if (active !== null) {
      paymentConflict("Another payment is already active for this Order.", {
        orderId: request.orderId,
        paymentId: active.id,
      });
    }
    throw error;
  }

  if (!reservation.created) {
    return reservation.payment.requestId === request.requestId
      ? resolveIdempotentPayment(reservation.payment, request)
      : toPaymentResult(reservation.payment);
  }

  const payment = reservation.payment;
  let decision: PaymentGatewayDecision;
  try {
    decision = await (
      dependencies.paymentGateway ?? mockVisaPaymentGateway
    ).authorize({
      requestId: request.requestId,
      orderId: request.orderId,
      amount: payment.amount.toNumber(),
      currency: "SGD",
      paymentCredentialReference: paymentMethod.providerCredentialRef,
    });
  } catch {
    decision = {
      status: "failed",
      cardholderVerified: false,
      authorizationReference: null,
      failureCode: "PAYMENT_FAILED",
      failureMessage: "The payment provider could not process the request.",
    };
  }

  const completed = await database.$transaction(async (transaction) => {
    const current = await transaction.payment.findUnique({
      where: { id: payment.id },
    });
    if (current === null) throwNotFound("Payment", payment.id);
    if (current.status !== DatabasePaymentStatus.PENDING) return current;

    const updated = await transaction.payment.update({
      where: { id: current.id },
      data: {
        status: databasePaymentStatus[decision.status],
        cardholderVerified: decision.cardholderVerified,
        authorizationReference: decision.authorizationReference,
        failureCode: decision.failureCode,
        failureMessage: decision.failureMessage,
      },
    });

    if (decision.status === "authorized") {
      const paid = await transaction.order.updateMany({
        where: { id: request.orderId, status: OrderStatus.PAYMENT_PENDING },
        data: { status: OrderStatus.PAID },
      });
      if (paid.count !== 1) {
        paymentConflict("The Order changed while payment was processing.", {
          orderId: request.orderId,
        });
      }
    } else if (decision.status === "declined" || decision.status === "failed") {
      const order = await transaction.order.findUnique({
        where: { id: request.orderId },
        include: {
          offer: { include: { variant: { include: { inventory: true } } } },
        },
      });
      if (order === null) throwNotFound("Order", request.orderId);
      await transaction.order.update({
        where: { id: order.id },
        data: { status: OrderStatus.PAYMENT_FAILED },
      });

      const inventory = order.offer.variant.inventory;
      if (inventory !== null && inventory.quantityReserved >= order.quantity) {
        const nextReserved = inventory.quantityReserved - order.quantity;
        await transaction.inventory.update({
          where: { id: inventory.id },
          data: {
            quantityReserved: nextReserved,
            availability: deriveInventoryAvailability(
              inventory.quantityAvailable,
              nextReserved,
            ),
          },
        });
      }
    }

    return updated;
  });

  return toPaymentResult(completed);
}

export async function getPaymentStatus(
  paymentId: string,
  dependencies: PaymentDependencies = {},
): Promise<PaymentResult> {
  const request = GetPaymentStatusRequestSchema.parse({ paymentId });
  const database = getCommerceDatabase(dependencies);
  const payment = await database.payment.findUnique({
    where: { id: request.paymentId },
  });
  if (payment === null) throwNotFound("Payment", request.paymentId);
  return toPaymentResult(payment);
}
