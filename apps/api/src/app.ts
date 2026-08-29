import Fastify, { type FastifyInstance } from "fastify";

import { registerApiErrorHandler } from "./http/error-handler.js";
import { healthRoutes } from "./routes/health.js";
import { intentsRoutes } from "./routes/intents.js";
import { createInventoryRoutes } from "./routes/inventory.js";
import { createMerchantsRoutes } from "./routes/merchants.js";
import { offersRoutes } from "./routes/offers.js";
import { ordersRoutes } from "./routes/orders.js";
import { paymentsRoutes } from "./routes/payments.js";
import { createPricingRoutes } from "./routes/pricing.js";
import { createProductsRoutes } from "./routes/products.js";
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
  const app = Fastify({ logger: options.logger ?? true });
  const commerceServices =
    options.commerceServices ?? defaultCommerceApiServices;

  registerApiErrorHandler(app);

  void app.register(healthRoutes);
  void app.register(usersRoutes, { prefix: "/v1/users" });
  void app.register(intentsRoutes, { prefix: "/v1/intents" });
  void app.register(createMerchantsRoutes(commerceServices), {
    prefix: "/v1/merchants",
  });
  void app.register(createProductsRoutes(commerceServices), {
    prefix: "/v1/products",
  });
  void app.register(createInventoryRoutes(commerceServices), {
    prefix: "/v1/products",
  });
  void app.register(createPricingRoutes(commerceServices), {
    prefix: "/v1/products",
  });
  void app.register(offersRoutes, { prefix: "/v1/offers" });
  void app.register(ordersRoutes, { prefix: "/v1/orders" });
  void app.register(paymentsRoutes, { prefix: "/v1/payments" });

  return app;
}
