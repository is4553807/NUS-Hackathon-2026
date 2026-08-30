import type { GetCategorySchema } from "./attribute-validation.js";
import type { ListCategories } from "./category-resolution.js";
import {
  emptyDraftIntent,
  type AgentCategory,
  type ChatSession,
  type ComparisonResult,
  type RealOffer,
} from "./domain-types.js";
import { applyHardFilter } from "./hard-filter.js";
import { askAttributeDiscoveryQuestion } from "./layers/attribute-discovery.js";
import {
  runCategoryDiscovery,
  runProvisionalShortlist,
  type DirectionCard,
  type ProvisionalShortlistItem,
} from "./layers/category-discovery.js";
import {
  extractIntent as defaultExtractIntent,
  type ExtractIntentInput,
  type ExtractIntentResult,
} from "./layers/extract-intent.js";
import { runFinalDecision } from "./layers/final-decision.js";
import { resolveMode } from "./layers/mode-resolver.js";
import { runToolEnabledTurn } from "./layers/tool-turn.js";
import { composeOfferSummary } from "./offer-summary.js";
import { handleSlashCommand } from "./slash-commands.js";

export interface IntentChip {
  label: string;
  field: string;
}

export type AgentTurnEvent =
  | { type: "system_message"; text: string }
  | { type: "clarifying_question"; question: string }
  | { type: "direction_cards"; cards: DirectionCard[] }
  | { type: "provisional_shortlist"; items: ProvisionalShortlistItem[] }
  | { type: "intent_chips"; chips: IntentChip[] }
  | { type: "searching_status"; text: string }
  | { type: "tiebreak_question"; question: string }
  | { type: "no_offers"; message: string }
  | {
      type: "comparison";
      winner: { offer: RealOffer; summary: string };
      alternatives: Array<{ offer: RealOffer; reason: string }>;
    }
  | { type: "transaction_preview"; offer: RealOffer; priceChanged: boolean }
  | { type: "new_request_divider" }
  | { type: "error"; message: string };

export interface OrchestratorDependencies {
  listCategories: ListCategories;
  getCategorySchema: GetCategorySchema;
  /** Injectable for deterministic conversation-state tests. */
  extractIntent?: (input: ExtractIntentInput) => Promise<ExtractIntentResult>;
}

function buildIntentChips(session: ChatSession): IntentChip[] {
  const { draftIntent } = session;
  const chips: IntentChip[] = [];
  const [onlyCandidate] = draftIntent.categoryCandidates;
  if (
    draftIntent.categoryCandidates.length === 1 &&
    onlyCandidate !== undefined
  ) {
    chips.push({ label: onlyCandidate, field: "category" });
  }
  if (draftIntent.budgetMax !== undefined) {
    chips.push({
      label: `Under $${draftIntent.budgetMax}`,
      field: "budgetMax",
    });
  }
  for (const [key, value] of Object.entries(draftIntent.requiredAttributes)) {
    chips.push({ label: `${key}: ${value}`, field: key });
  }
  const deadline = draftIntent.deliveryDeadline ?? draftIntent.scheduleDeadline;
  if (deadline !== undefined) {
    chips.push({ label: deadline, field: "deadline" });
  }
  return chips;
}

async function runComparisonForOffers(
  category: AgentCategory,
  userQuery: string,
  offers: RealOffer[],
): Promise<{ events: AgentTurnEvent[]; comparison: ComparisonResult | null }> {
  if (offers.length === 0) {
    return {
      events: [
        {
          type: "no_offers",
          message: "No participating merchant currently has this.",
        },
      ],
      comparison: null,
    };
  }

  if (offers.length === 1) {
    const only = offers[0];
    if (only === undefined)
      throw new Error("Unreachable: offers.length === 1.");
    const comparison: ComparisonResult = {
      selectedOfferId: only.offerId,
      reasoning:
        "Only one offer survived the hard filter — no further comparison needed.",
      rejectedOffers: [],
      askClarifyingQuestion: null,
    };
    return {
      events: [
        {
          type: "comparison",
          winner: { offer: only, summary: composeOfferSummary(only) },
          alternatives: [],
        },
      ],
      comparison,
    };
  }

  const structuralTie = findStructuralTie(offers);
  if (structuralTie !== null) {
    // AGENT_SPEC.md §5 Step E/F: two or more offers with byte-identical
    // attributes and price genuinely don't differ on anything that
    // matters — detected deterministically here rather than left to the
    // LLM's judgment, since live testing showed the model doesn't reliably
    // notice an exact tie on its own. The one real differentiator left is
    // merchant, so that's what the question asks about.
    const question = `Do you have a preferred merchant between ${structuralTie.map((o) => o.merchantName).join(" and ")}? They're otherwise identical.`;
    const tieComparison: ComparisonResult = {
      selectedOfferId: "",
      reasoning:
        "Multiple offers are identical on every real attribute and price.",
      rejectedOffers: [],
      askClarifyingQuestion: question,
    };
    return {
      events: [{ type: "tiebreak_question", question }],
      comparison: tieComparison,
    };
  }

  const decision = await runFinalDecision({
    category,
    userQuery,
    offers,
    allowClarification: true,
  });
  if (decision.askClarifyingQuestion !== null) {
    return {
      events: [
        { type: "tiebreak_question", question: decision.askClarifyingQuestion },
      ],
      comparison: decision,
    };
  }

  return {
    events: [...toComparisonEvents(offers, decision)],
    comparison: decision,
  };
}

export async function recommendAlternativeAfterUnavailable(
  session: ChatSession,
  unavailableOfferId: string,
): Promise<AgentTurnEvent[]> {
  const remaining = (session.lastOffers ?? []).filter(
    (offer) => offer.offerId !== unavailableOfferId,
  );
  session.lastOffers = remaining;
  const category =
    session.draftIntent.categoryCandidates[0] ??
    session.lastOffers?.[0]?.categoryId ??
    "catalog";
  const { events, comparison } = await runComparisonForOffers(
    category,
    session.draftIntent.rawQuery,
    remaining,
  );
  if (comparison === null) {
    session.state = "collecting_intent";
    delete session.lastComparison;
    return events;
  }
  session.lastComparison = comparison;
  session.state =
    comparison.askClarifyingQuestion === null
      ? "recommendation_ready"
      : "awaiting_preference";
  return events;
}

function attributesEqual(
  a: RealOffer["attributes"],
  b: RealOffer["attributes"],
): boolean {
  const aEntries = Object.entries(a).sort(([x], [y]) => x.localeCompare(y));
  const bEntries = Object.entries(b).sort(([x], [y]) => x.localeCompare(y));
  return JSON.stringify(aEntries) === JSON.stringify(bEntries);
}

export function findStructuralTie(offers: RealOffer[]): RealOffer[] | null {
  for (let i = 0; i < offers.length; i += 1) {
    for (let j = i + 1; j < offers.length; j += 1) {
      const a = offers[i];
      const b = offers[j];
      if (a === undefined || b === undefined) continue;
      if (
        a.offeredPrice === b.offeredPrice &&
        attributesEqual(a.attributes, b.attributes)
      ) {
        return [a, b];
      }
    }
  }
  return null;
}

type StructuralTieResolution =
  | { kind: "resolved"; decision: ComparisonResult }
  | { kind: "needs_answer"; question: string };

function explicitNoPreference(answer: string): boolean {
  return /\b(no preference|either one|either merchant|whichever|you (?:can )?choose|don'?t care)\b/iu.test(
    answer,
  );
}

function nonAnsweringPreferenceReply(answer: string): boolean {
  const normalized = answer.trim().toLocaleLowerCase("en");
  return (
    normalized.includes("?") ||
    /^(what|why|how|which one is|not really|not sure|i don'?t know)\b/u.test(
      normalized,
    ) ||
    /\bwhat(?:'s| is) the difference\b/u.test(normalized)
  );
}

/** Resolves a structural tie only when the user actually answers it. */
export function resolveStructuralTieByMerchantName(
  tied: RealOffer[],
  allOffers: RealOffer[],
  answer: string,
): StructuralTieResolution {
  const normalizedAnswer = answer.toLocaleLowerCase("en");
  let matched = tied.find((offer) =>
    normalizedAnswer.includes(offer.merchantName.toLocaleLowerCase("en")),
  );

  if (matched === undefined && explicitNoPreference(answer)) {
    matched = [...tied].sort((a, b) =>
      a.merchantName.localeCompare(b.merchantName),
    )[0];
  }

  if (matched === undefined) {
    const merchantNames = tied.map((offer) => offer.merchantName).join(" or ");
    return {
      kind: "needs_answer",
      question:
        `There is no product, price, or specification difference between these returned offers; only the merchant differs. ` +
        `Which would you prefer: ${merchantNames}?`,
    };
  }

  const userHadNoPreference = explicitNoPreference(answer);
  return {
    kind: "resolved",
    decision: {
      selectedOfferId: matched.offerId,
      reasoning: userHadNoPreference
        ? `The user stated no merchant preference; ${matched.merchantName} was selected deterministically from otherwise identical offers.`
        : `Selected based on the stated merchant preference for ${matched.merchantName}; the tied offers were otherwise identical.`,
      rejectedOffers: allOffers
        .filter((offer) => offer.offerId !== matched.offerId)
        .map((offer) => ({
          offerId: offer.offerId,
          reason: tied.some((t) => t.offerId === offer.offerId)
            ? userHadNoPreference
              ? `Identical offer from ${offer.merchantName}; the user had no merchant preference.`
              : `Identical offer from ${offer.merchantName}; ${matched.merchantName} was the stated preference.`
            : "Did not match as well as the recommended option.",
        })),
      askClarifyingQuestion: null,
    },
  };
}

function toComparisonEvents(
  offers: RealOffer[],
  decision: ComparisonResult,
): AgentTurnEvent[] {
  const winner = offers.find(
    (offer) => offer.offerId === decision.selectedOfferId,
  );
  if (winner === undefined) {
    return [
      {
        type: "error",
        message: "The recommendation could not be grounded in a real offer.",
      },
    ];
  }
  const alternatives = offers
    .filter((offer) => offer.offerId !== winner.offerId)
    .map((offer) => ({
      offer,
      reason:
        decision.rejectedOffers.find(
          (rejected) => rejected.offerId === offer.offerId,
        )?.reason ?? "Did not match as well as the recommended option.",
    }));

  return [
    {
      type: "comparison",
      winner: { offer: winner, summary: composeOfferSummary(winner) },
      alternatives,
    },
  ];
}

function assistantTextForEvent(event: AgentTurnEvent): string | null {
  switch (event.type) {
    case "system_message":
      return event.text;
    case "clarifying_question":
    case "tiebreak_question":
      return event.question;
    case "no_offers":
    case "error":
      return event.message;
    case "comparison":
      return event.winner.summary;
    default:
      return null;
  }
}

function recordAssistantEvents(
  session: ChatSession,
  events: AgentTurnEvent[],
): void {
  for (const event of events) {
    const content = assistantTextForEvent(event);
    if (content !== null && content.length > 0) {
      session.conversationHistory.push({ role: "assistant", content });
    }
  }
  session.conversationHistory = session.conversationHistory.slice(-24);
}

/**
 * AGENT_SPEC §10's completed → idle boundary. This intentionally mutates the
 * existing session object because the API's in-memory store holds this exact
 * reference. No shopping or payment state survives the boundary.
 */
export function resetCompletedConversation(session: ChatSession): boolean {
  if (session.state !== "completed") return false;

  session.state = "collecting_intent";
  session.draftIntent = emptyDraftIntent();
  session.conversationHistory = [];
  delete session.sessionBudgetOverride;
  delete session.lastComparison;
  delete session.lastOffers;
  delete session.pendingClarification;
  delete session.order;
  delete session.payment;
  return true;
}

async function runSearchAndCompare(
  session: ChatSession,
  deps: OrchestratorDependencies,
): Promise<AgentTurnEvent[]> {
  const mode = resolveMode(session.draftIntent);
  if (mode.mode !== "directed") {
    throw new Error(
      "runSearchAndCompare called before Layer 2 resolved to Mode 1.",
    );
  }

  session.state = "searching";
  const toolResult = await runToolEnabledTurn(
    mode.intent,
    deps.listCategories,
    deps.getCategorySchema,
  );

  if (!toolResult.wasCalled) {
    return [
      {
        type: "error",
        message: "The search did not complete — please try again.",
      },
    ];
  }
  if (toolResult.toolErrorMessage !== null) {
    return [{ type: "error", message: toolResult.toolErrorMessage }];
  }

  session.state = "evaluating_offers";
  // AGENT_SPEC.md §4/§6 Step A: independent, deterministic re-check — this
  // is the ONLY thing that decides which offers are even eligible to be
  // recommended, regardless of anything the model said in this turn.
  const { survivors } = applyHardFilter(
    toolResult.offers,
    toolResult.sanitizedIntent,
  );
  session.lastOffers = survivors;

  const { events, comparison } = await runComparisonForOffers(
    mode.intent.category,
    mode.intent.rawQuery,
    survivors,
  );
  if (comparison !== null) {
    session.lastComparison = comparison;
    session.state =
      comparison.askClarifyingQuestion !== null
        ? "awaiting_preference"
        : "recommendation_ready";
  }
  return events;
}

async function eventsForCurrentDraft(
  session: ChatSession,
  deps: OrchestratorDependencies,
): Promise<AgentTurnEvent[]> {
  const mode = resolveMode(session.draftIntent);

  if (mode.mode === "category_discovery") {
    session.state = "collecting_intent";
    const cards = await runCategoryDiscovery(
      session.draftIntent,
      deps.listCategories,
    );
    return [{ type: "direction_cards", cards }];
  }

  if (mode.mode === "attribute_discovery") {
    session.state = "collecting_intent";
    const [question, provisionalItems] = await Promise.all([
      askAttributeDiscoveryQuestion({
        category: mode.category,
        missingFields: mode.missingFields,
        draft: session.draftIntent,
      }),
      runProvisionalShortlist(
        session.draftIntent,
        mode.category,
        deps.listCategories,
      ).catch(() => []),
    ]);
    return [
      { type: "clarifying_question", question },
      ...(provisionalItems.length > 0
        ? [{ type: "provisional_shortlist" as const, items: provisionalItems }]
        : []),
    ];
  }

  session.state = "intent_ready";
  const chipEvent: AgentTurnEvent = {
    type: "intent_chips",
    chips: buildIntentChips(session),
  };
  const searchingEvent: AgentTurnEvent = {
    type: "searching_status",
    text: "Checking a few merchants…",
  };
  const resultEvents = await runSearchAndCompare(session, deps);
  return [chipEvent, searchingEvent, ...resultEvents];
}

/** Intent-chip edit action (TASKS item 14). Clearing a chip is a state
 * transition, not a text prompt; Layer 2 is run immediately on the changed
 * draft so the next component states exactly what must be supplied. */
export async function handleIntentEdit(
  session: ChatSession,
  field: string,
  deps: OrchestratorDependencies,
): Promise<AgentTurnEvent[]> {
  clearIntentField(session, field);

  const events = await eventsForCurrentDraft(session, deps);
  recordAssistantEvents(session, events);
  return events;
}

export function clearIntentField(session: ChatSession, field: string): void {
  switch (field) {
    case "category":
      session.draftIntent.categoryCandidates = [];
      break;
    case "budgetMax":
      delete session.draftIntent.budgetMax;
      delete session.sessionBudgetOverride;
      break;
    case "deadline":
      delete session.draftIntent.deliveryDeadline;
      delete session.draftIntent.scheduleDeadline;
      break;
    default:
      delete session.draftIntent.requiredAttributes[field];
      break;
  }
  delete session.lastComparison;
  delete session.lastOffers;
  session.state = "collecting_intent";
}

export async function handleMessage(
  session: ChatSession,
  message: string,
  deps: OrchestratorDependencies,
): Promise<AgentTurnEvent[]> {
  const startsNewRequest = resetCompletedConversation(session);
  const prefixEvents: AgentTurnEvent[] = startsNewRequest
    ? [{ type: "new_request_divider" }]
    : [];
  const respond = (events: AgentTurnEvent[]): AgentTurnEvent[] => {
    recordAssistantEvents(session, events);
    return [...prefixEvents, ...events];
  };

  const slashResult = handleSlashCommand(session, message);
  if (slashResult.handled) {
    if ("comparison" in slashResult && slashResult.comparison !== undefined) {
      const offers = session.lastOffers ?? [];
      return respond(toComparisonEvents(offers, slashResult.comparison));
    }
    return respond([
      {
        type: "system_message",
        text: "message" in slashResult ? slashResult.message : "",
      },
    ]);
  }

  // Mode 1 tiebreak resolution: a pending clarifying question means this
  // message is the user's answer, not a fresh intent — resolve it before
  // running Layer 1 again.
  if (
    session.state === "awaiting_preference" &&
    session.lastOffers !== undefined
  ) {
    session.conversationHistory.push({ role: "user", content: message });
    const category =
      session.draftIntent.categoryCandidates[0] ??
      session.lastOffers[0]?.categoryId ??
      "catalog";
    const structuralTie = findStructuralTie(session.lastOffers);
    if (structuralTie !== null) {
      const resolution = resolveStructuralTieByMerchantName(
        structuralTie,
        session.lastOffers,
        message,
      );
      if (resolution.kind === "needs_answer") {
        session.state = "awaiting_preference";
        return respond([
          { type: "tiebreak_question", question: resolution.question },
        ]);
      }
      session.lastComparison = resolution.decision;
      session.state = "recommendation_ready";
      return respond(
        toComparisonEvents(session.lastOffers, resolution.decision),
      );
    }

    if (nonAnsweringPreferenceReply(message)) {
      const summaries = session.lastOffers
        .slice(0, 2)
        .map(composeOfferSummary)
        .join(" ");
      const originalQuestion =
        session.lastComparison?.askClarifyingQuestion ??
        "Which option do you prefer?";
      return respond([
        {
          type: "tiebreak_question",
          question: `${summaries} ${originalQuestion}`,
        },
      ]);
    }

    const decision = await runFinalDecision({
      category,
      userQuery: session.draftIntent.rawQuery,
      offers: session.lastOffers,
      userAnswer: message,
      allowClarification: false,
    });
    session.lastComparison = decision;
    session.state = "recommendation_ready";
    return respond(toComparisonEvents(session.lastOffers, decision));
  }

  const extractIntent = deps.extractIntent ?? defaultExtractIntent;
  let extraction: ExtractIntentResult;
  try {
    const availableCategories = await deps.listCategories();
    extraction = await extractIntent({
      message,
      currentDraft: session.draftIntent,
      conversationHistory: session.conversationHistory,
      availableCategories,
    });
  } catch (error) {
    console.error("Layer 1 extraction failed.", error);
    session.conversationHistory.push({ role: "user", content: message });
    return respond([
      {
        type: "error",
        message:
          "Couldn't quite catch that — try including what you're looking for and a budget.",
      },
    ]);
  }

  session.conversationHistory.push({ role: "user", content: message });
  session.draftIntent = {
    ...extraction.draftIntent,
    budgetMax:
      session.sessionBudgetOverride ?? extraction.draftIntent.budgetMax,
  };

  return respond(await eventsForCurrentDraft(session, deps));
}

/**
 * AGENT_SPEC.md §7 / §15: OFFER_EXPIRED and PRICE_CHANGED never proceed on
 * stale numbers. This re-runs the search fresh and always returns a new
 * transaction preview requiring a fresh explicit confirmation — the
 * original tap never carries over.
 */
export async function refreshOfferAfterStaleness(
  session: ChatSession,
  deps: OrchestratorDependencies,
): Promise<AgentTurnEvent[]> {
  const events = await runSearchAndCompare(session, deps);
  const comparisonEvent = events.find(
    (event): event is Extract<AgentTurnEvent, { type: "comparison" }> =>
      event.type === "comparison",
  );
  if (comparisonEvent === undefined) return events;
  return [
    ...events,
    {
      type: "transaction_preview",
      offer: comparisonEvent.winner.offer,
      priceChanged: true,
    },
  ];
}
