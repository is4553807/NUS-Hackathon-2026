import {
  getOrCreateSession,
  handleMessage,
  handleIntentEdit,
  newSessionId,
  pollPaymentStatus,
  recommendAlternativeAfterUnavailable,
  refreshOfferAfterStaleness,
  requestIdStore,
  submitOrder,
  submitPayment,
  type AgentTurnEvent,
  type CategoryAttributeSchema,
  type GetCategorySchema,
  type ListCategories,
} from "@visa-commerce/agent";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import type { CommerceApiServices } from "../services.js";

function toListCategories(services: CommerceApiServices): ListCategories {
  return async () => {
    const categories = await services.listCategories();
    return categories.map((category) => ({
      categoryId: category.categoryId,
      commerceDomain: category.commerceDomain,
      name: category.name,
      slug: category.slug,
      aliases: category.aliases,
      level: category.level,
    }));
  };
}

function toGetCategorySchema(services: CommerceApiServices): GetCategorySchema {
  return async (categoryId) => {
    try {
      const schema = await services.getCategorySchema(categoryId);
      return schema.attributeSchema as unknown as CategoryAttributeSchema;
    } catch {
      // No schema for this category (e.g. a domain root category with no
      // leaf-level attribute definitions) — attribute-validation.ts treats
      // null as "nothing is validated as a known attribute."
      return null;
    }
  };
}

const MessageBodySchema = z.object({
  sessionId: z.string().optional(),
  message: z.string().min(1),
});

const ConfirmBodySchema = z.object({
  sessionId: z.string(),
  paymentMethodId: z.string().optional(),
});

const EditIntentBodySchema = z.object({
  sessionId: z.string(),
  field: z.string().min(1),
});

const PaymentStatusBodySchema = z.object({
  sessionId: z.string(),
  paymentId: z.string(),
});

/**
 * TIM's own agent-chat route (apps/api/src/routes/intents.ts is the TODO(TIM)
 * marker in the pre-existing scaffold; this is the thin adapter it points
 * at). Every response here is a typed AgentTurnEvent[] rendered by the real
 * CONSUMER_UX.md components on the web client — never raw JSON dumped to
 * the user (CLAUDE.md rule 7).
 */
export function createAgentRoutes(
  services: CommerceApiServices,
): FastifyPluginAsync {
  const deps = {
    listCategories: toListCategories(services),
    getCategorySchema: toGetCategorySchema(services),
  };

  return async (app) => {
    app.post("/messages", async (request, reply) => {
      const body = MessageBodySchema.parse(request.body);
      const sessionId = body.sessionId ?? newSessionId();
      const session = getOrCreateSession(sessionId);
      const events: AgentTurnEvent[] = await handleMessage(
        session,
        body.message,
        deps,
      );
      return reply.send({ sessionId, events });
    });

    app.post("/edit-intent", async (request, reply) => {
      const body = EditIntentBodySchema.parse(request.body);
      const session = getOrCreateSession(body.sessionId);
      const events = await handleIntentEdit(session, body.field, deps);
      return reply.send({ sessionId: session.sessionId, events });
    });

    app.post("/confirm", async (request, reply) => {
      const body = ConfirmBodySchema.parse(request.body);
      const session = getOrCreateSession(body.sessionId);

      const selectedOfferId = session.lastComparison?.selectedOfferId;
      const offer = session.lastOffers?.find(
        (candidate) => candidate.offerId === selectedOfferId,
      );
      if (offer === undefined) {
        return reply
          .status(409)
          .send({
            events: [
              {
                type: "error",
                message: "There is no confirmed recommendation to act on.",
              },
            ],
          });
      }

      session.state = "confirmed";
      const orderOutcome = await submitOrder(
        offer,
        requestIdStore,
        session.sessionId,
      );

      if (orderOutcome.kind === "needs_fresh_offer") {
        // AGENT_SPEC.md §7/§15: never proceed on stale numbers — fetch fresh
        // offers and require a brand-new explicit confirmation.
        session.state = "recommendation_ready";
        const events = await refreshOfferAfterStaleness(session, deps);
        return reply.send({
          sessionId: session.sessionId,
          events,
          staleness: orderOutcome.reason,
        });
      }
      if (orderOutcome.kind === "unavailable") {
        const events = await recommendAlternativeAfterUnavailable(
          session,
          offer.offerId,
        );
        return reply.send({ sessionId: session.sessionId, events });
      }
      if (orderOutcome.kind === "error") {
        return reply.send({
          sessionId: session.sessionId,
          events: [{ type: "error", message: orderOutcome.message }],
        });
      }

      session.order = {
        orderId: orderOutcome.order.orderId,
        requestId: orderOutcome.requestId,
      };
      session.state = "payment_pending";

      const paymentOutcome = await submitPayment(
        orderOutcome.order.orderId,
        requestIdStore,
        session.sessionId,
        body.paymentMethodId,
      );

      if (paymentOutcome.kind === "authorized") {
        session.state = "completed";
        return reply.send({
          sessionId: session.sessionId,
          orderId: orderOutcome.order.orderId,
          payment: {
            status: "authorized",
            reference: paymentOutcome.payment.authorizationReference,
          },
        });
      }
      if (paymentOutcome.kind === "declined") {
        return reply.send({
          sessionId: session.sessionId,
          orderId: orderOutcome.order.orderId,
          payment: { status: "declined" },
        });
      }
      if (paymentOutcome.kind === "pending") {
        session.payment = {
          paymentId: paymentOutcome.paymentId,
          requestId: paymentOutcome.requestId,
        };
        return reply.send({
          sessionId: session.sessionId,
          orderId: orderOutcome.order.orderId,
          payment: {
            status: "processing",
            paymentId: paymentOutcome.paymentId,
          },
        });
      }

      return reply.send({
        sessionId: session.sessionId,
        events: [{ type: "error", message: paymentOutcome.message }],
      });
    });

    app.post("/payment-status", async (request, reply) => {
      const body = PaymentStatusBodySchema.parse(request.body);
      const result = await pollPaymentStatus(body.paymentId);
      if (result.status === "authorized") {
        const session = getOrCreateSession(body.sessionId);
        session.state = "completed";
      }
      return reply.send({ payment: result });
    });
  };
}
