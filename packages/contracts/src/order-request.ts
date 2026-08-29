import { z } from "zod";

import { TimestampSchema, UuidSchema } from "./common.js";

export const ConfirmationChannelSchema = z.enum(["telegram", "web", "app"]);

export const OrderRequestSchema = z.object({
  requestId: UuidSchema,
  userId: UuidSchema,
  offerId: UuidSchema,
  userConfirmed: z.literal(true),
  confirmedAt: TimestampSchema,
  confirmationChannel: ConfirmationChannelSchema,
});

export type ConfirmationChannel = z.infer<typeof ConfirmationChannelSchema>;
export type OrderRequest = z.infer<typeof OrderRequestSchema>;
