import type { Bot } from "grammy";

export function registerStartHandler(bot: Bot): void {
  bot.command("start", async (context) => {
    await context.reply("Visa Commerce bot foundation is running.");
  });
}
