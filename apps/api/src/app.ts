import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";

import { registerApiErrorHandler } from "./http/error-handler.js";
import { createAgentRoutes } from "./routes/agent.js";
import { createCategoriesRoutes } from "./routes/categories.js";
import { healthRoutes } from "./routes/health.js";
import { intentsRoutes } from "./routes/intents.js";
import {
  createInventoryCheckRoutes,
  createInventoryRoutes,
} from "./routes/inventory.js";
import { createMerchantsRoutes } from "./routes/merchants.js";
import { createOffersRoutes } from "./routes/offers.js";
import { createOrdersRoutes } from "./routes/orders.js";
import { createPaymentsRoutes } from "./routes/payments.js";
import { createPricingRoutes } from "./routes/pricing.js";
import { createProductsRoutes } from "./routes/products.js";
import { createSearchRoutes } from "./routes/search.js";
import { usersRoutes } from "./routes/users.js";
import {
  defaultCommerceApiServices,
  type CommerceApiServices,
} from "./services.js";

export type BuildAppOptions = {
  logger?: boolean;
  commerceServices?: CommerceApiServices;
};

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({
    logger: options.logger ?? true,
    bodyLimit: 2_000_000,
  });
  const commerceServices =
    options.commerceServices ?? defaultCommerceApiServices;

  registerApiErrorHandler(app);

  // The web client (apps/web) runs on a different origin/port in dev, so the
  // browser sends a CORS preflight before every POST — with no CORS plugin
  // registered that OPTIONS request 404s and every agent chat call fails
  // before it ever reaches a route handler.
  void app.register(cors, {
    origin: (process.env.WEB_ORIGIN ?? "http://localhost:3000").split(","),
  });

  void app.register(healthRoutes);
  void app.register(usersRoutes, { prefix: "/v1/users" });
  void app.register(intentsRoutes, { prefix: "/v1/intents" });
  void app.register(createAgentRoutes(commerceServices), {
    prefix: "/v1/agent",
  });
  void app.register(createMerchantsRoutes(commerceServices), {
    prefix: "/v1/merchants",
  });
  void app.register(createCategoriesRoutes(commerceServices), {
    prefix: "/v1/categories",
  });
  void app.register(createProductsRoutes(commerceServices), {
    prefix: "/v1/products",
  });
  void app.register(createInventoryRoutes(commerceServices), {
    prefix: "/v1/variants",
  });
  void app.register(createPricingRoutes(commerceServices), {
    prefix: "/v1/products",
  });
  void app.register(createSearchRoutes(commerceServices), {
    prefix: "/v1/search",
  });
  void app.register(createInventoryCheckRoutes(commerceServices), {
    prefix: "/v1/inventory",
  });
  void app.register(createOffersRoutes(commerceServices), {
    prefix: "/v1/offers",
  });
  void app.register(createOrdersRoutes(commerceServices), {
    prefix: "/v1/orders",
  });
  void app.register(createPaymentsRoutes(commerceServices), {
    prefix: "/v1/payments",
  });

  return app;
}
