import Fastify, { type FastifyInstance } from "fastify";

import { healthRoutes } from "./routes/health.js";
import { intentsRoutes } from "./routes/intents.js";
import { inventoryRoutes } from "./routes/inventory.js";
import { merchantsRoutes } from "./routes/merchants.js";
import { offersRoutes } from "./routes/offers.js";
import { ordersRoutes } from "./routes/orders.js";
import { paymentsRoutes } from "./routes/payments.js";
import { pricingRoutes } from "./routes/pricing.js";
import { productsRoutes } from "./routes/products.js";
import { usersRoutes } from "./routes/users.js";

export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: true });

  void app.register(healthRoutes);
  void app.register(usersRoutes, { prefix: "/v1/users" });
  void app.register(intentsRoutes, { prefix: "/v1/intents" });
  void app.register(merchantsRoutes, { prefix: "/v1/merchants" });
  void app.register(productsRoutes, { prefix: "/v1/products" });
  void app.register(inventoryRoutes, { prefix: "/v1/inventory" });
  void app.register(pricingRoutes, { prefix: "/v1/pricing" });
  void app.register(offersRoutes, { prefix: "/v1/offers" });
  void app.register(ordersRoutes, { prefix: "/v1/orders" });
  void app.register(paymentsRoutes, { prefix: "/v1/payments" });

  return app;
}
