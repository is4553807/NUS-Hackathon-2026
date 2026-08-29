import { Bot } from "grammy";

import { readTelegramEnv } from "./env.js";
import { registerCallbackHandler } from "./handlers/callback.js";
import { registerMessageHandler } from "./handlers/message.js";
import { registerStartHandler } from "./handlers/start.js";

async function main(): Promise<void> {
  const env = readTelegramEnv();

  if (env === null) {
    process.exitCode = 1;
    return;
  }

  const bot = new Bot(env.TELEGRAM_BOT_TOKEN);

  registerStartHandler(bot);
  registerMessageHandler(bot);
  registerCallbackHandler(bot);

  await bot.start();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
