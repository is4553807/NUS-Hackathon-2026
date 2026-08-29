import { z } from "zod";

const TelegramEnvSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().trim().min(1),
});

export type TelegramEnv = z.infer<typeof TelegramEnvSchema>;

export function readTelegramEnv(): TelegramEnv | null {
  const result = TelegramEnvSchema.safeParse(process.env);

  if (!result.success) {
    console.error(
      "TELEGRAM_BOT_TOKEN is required to start the Telegram application.",
    );
    return null;
  }

  return result.data;
}
