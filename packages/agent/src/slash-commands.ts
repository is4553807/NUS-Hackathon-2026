import { emptyDraftIntent, type ChatSession } from "./domain-types.js";

export type SlashCommandResult =
  | { handled: false }
  | { handled: true; message: string }
  | { handled: true; comparison: ChatSession["lastComparison"] };

/** CONSUMER_UX.md §2 — the only four slash commands in scope for the demo. */
export function handleSlashCommand(
  session: ChatSession,
  message: string,
): SlashCommandResult {
  const trimmed = message.trim();
  if (!trimmed.startsWith("/")) return { handled: false };

  const [command, ...rest] = trimmed.split(/\s+/);

  switch (command) {
    case "/reset": {
      session.state = "collecting_intent";
      session.draftIntent = emptyDraftIntent();
      session.conversationHistory = [];
      delete session.sessionBudgetOverride;
      delete session.lastComparison;
      delete session.lastOffers;
      delete session.pendingClarification;
      delete session.order;
      delete session.payment;
      return { handled: true, message: "Tell me what you're looking for." };
    }
    case "/budget": {
      const amount = Number(rest[0]);
      if (!Number.isFinite(amount) || amount <= 0) {
        return {
          handled: true,
          message: "Give a budget as a positive number, like /budget 150.",
        };
      }
      session.sessionBudgetOverride = amount;
      session.draftIntent.budgetMax = amount;
      return {
        handled: true,
        message: `Budget set to $${amount} for this session.`,
      };
    }
    case "/compare": {
      if (session.lastComparison === undefined) {
        return {
          handled: true,
          message: "There's no recommendation yet to compare.",
        };
      }
      return { handled: true, comparison: session.lastComparison };
    }
    case "/why": {
      if (session.lastComparison === undefined) {
        return {
          handled: true,
          message: "There's no recommendation yet to explain.",
        };
      }
      return { handled: true, message: session.lastComparison.reasoning };
    }
    default:
      return { handled: true, message: `Unrecognized command "${command}".` };
  }
}
