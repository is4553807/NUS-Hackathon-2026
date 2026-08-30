"use client";

import { useEffect, useRef, useState } from "react";

import {
  AppHeader,
  ChatBubble,
  ComparisonView,
  ConversationDivider,
  DirectionCards,
  IntentChipRow,
  PaymentResultView,
  ProvisionalShortlist,
  SearchingStatus,
  TransactionPreview,
  WelcomeMessage,
} from "../../../components/consumer/chat-components";
import {
  confirmPurchase,
  editIntent,
  pollPaymentStatus,
  sendMessage,
  type AgentTurnEvent,
  type IntentChip,
  type RealOffer,
} from "../../../lib/agent-api";

interface Turn {
  id: string;
  role: "user" | "agent";
  text?: string;
  chips?: IntentChip[];
  cards?: Array<{
    productId: string;
    name: string;
    description: string;
    images?: string[];
  }>;
  provisionalItems?: Array<{
    productId: string;
    name: string;
    summary: string;
    images?: string[];
  }>;
  comparison?: {
    winner: { offer: RealOffer; summary: string };
    alternatives: Array<{ offer: RealOffer; reason: string }>;
  };
  preview?: { offer: RealOffer; priceChanged: boolean };
  paymentStatus?: "authorized" | "declined" | "processing";
  paymentMerchant?: string;
  divider?: "complete" | "new_request";
  status?: string;
  error?: boolean;
}

const SLASH_COMMANDS = [
  { command: "/reset", hint: "Clear the current intent and start over" },
  { command: "/budget", hint: "Set a spend guardrail for this session" },
  { command: "/compare", hint: "Re-open the full comparison view" },
  { command: "/why", hint: "Re-explain the last recommendation" },
];

function eventsToTurns(events: AgentTurnEvent[]): Turn[] {
  const turns: Turn[] = [];
  for (const event of events) {
    const id = `${Date.now()}-${turns.length}-${Math.random()}`;
    switch (event.type) {
      case "system_message":
        turns.push({ id, role: "agent", text: event.text });
        break;
      case "clarifying_question":
        turns.push({ id, role: "agent", text: event.question });
        break;
      case "tiebreak_question":
        turns.push({ id, role: "agent", text: event.question });
        break;
      case "no_offers":
        turns.push({ id, role: "agent", text: event.message });
        break;
      case "error":
        turns.push({ id, role: "agent", text: event.message, error: true });
        break;
      case "intent_chips":
        turns.push({ id, role: "agent", chips: event.chips });
        break;
      case "searching_status":
        turns.push({ id, role: "agent", status: event.text });
        break;
      case "direction_cards":
        turns.push({ id, role: "agent", cards: event.cards });
        break;
      case "provisional_shortlist":
        turns.push({ id, role: "agent", provisionalItems: event.items });
        break;
      case "comparison":
        turns.push({
          id,
          role: "agent",
          comparison: {
            winner: event.winner,
            alternatives: event.alternatives,
          },
        });
        break;
      case "transaction_preview":
        turns.push({
          id,
          role: "agent",
          preview: { offer: event.offer, priceChanged: event.priceChanged },
        });
        break;
      case "new_request_divider":
        turns.push({ id, role: "agent", divider: "new_request" });
        break;
    }
  }
  return turns;
}

async function pollUntilTerminal(sessionId: string, paymentId: string) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const result = await pollPaymentStatus(sessionId, paymentId);
    if (
      result.payment.status === "authorized" ||
      result.payment.status === "declined"
    ) {
      return result.payment.status;
    }
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, 750);
    });
  }
  return "processing" as const;
}

export default function ConsumerChatPage() {
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pendingOffer, setPendingOffer] = useState<RealOffer | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const insertedNewRequestDividerRef = useRef(false);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      block: "end",
      behavior: "smooth",
    });
  }, [turns, sending]);

  const showSlashMenu = input.startsWith("/");
  const filteredCommands = SLASH_COMMANDS.filter((c) =>
    c.command.startsWith(input.split(" ")[0] ?? "/"),
  );

  function prepareAgentTurns(events: AgentTurnEvent[]): Turn[] {
    let newTurns = eventsToTurns(events);
    if (insertedNewRequestDividerRef.current) {
      newTurns = newTurns.filter((turn) => turn.divider !== "new_request");
      insertedNewRequestDividerRef.current = false;
    }
    const comparisonTurn = newTurns.find(
      (turn) => turn.comparison !== undefined,
    );
    if (comparisonTurn?.comparison !== undefined) {
      setPendingOffer(comparisonTurn.comparison.winner.offer);
      if (!newTurns.some((turn) => turn.preview !== undefined)) {
        newTurns.push({
          id: `${Date.now()}-preview`,
          role: "agent",
          preview: {
            offer: comparisonTurn.comparison.winner.offer,
            priceChanged: false,
          },
        });
      }
    }
    return newTurns;
  }

  async function handleSend(text: string) {
    const trimmed = text.trim();
    if (trimmed.length === 0 || sending) return;
    setInput("");
    setSending(true);
    const startsAfterCompletion = turns.at(-1)?.divider === "complete";
    if (startsAfterCompletion) insertedNewRequestDividerRef.current = true;
    setTurns((prev) => [
      ...prev,
      ...(startsAfterCompletion
        ? [
            {
              id: `${Date.now()}-new-request`,
              role: "agent" as const,
              divider: "new_request" as const,
            },
          ]
        : []),
      { id: `${Date.now()}-user`, role: "user", text: trimmed },
    ]);

    try {
      const response = await sendMessage(sessionId, trimmed);
      setSessionId(response.sessionId);
      const newTurns = prepareAgentTurns(response.events);
      setTurns((prev) => [...prev, ...newTurns]);
    } catch (error) {
      insertedNewRequestDividerRef.current = false;
      const message =
        error instanceof Error
          ? error.message
          : "The agent couldn't process that message — include what you're looking for and a budget.";
      setTurns((prev) => [
        ...prev,
        { id: `${Date.now()}-err`, role: "agent", text: message, error: true },
      ]);
    } finally {
      setSending(false);
    }
  }

  async function handleConfirm() {
    if (sessionId === undefined || pendingOffer === null || confirming) return;
    setConfirming(true);
    try {
      const result = await confirmPurchase(sessionId);

      if (result.staleness !== undefined) {
        // AGENT_SPEC.md §7/§15: never proceed on stale numbers — the backend
        // already fetched a fresh offer; show it and require a fresh tap.
        const newTurns = prepareAgentTurns(result.events ?? []);
        setTurns((prev) => [
          ...prev,
          {
            id: `${Date.now()}-stale`,
            role: "agent",
            text: "The price changed — here's the updated offer.",
          },
          ...newTurns,
        ]);
        return;
      }

      if (result.events !== undefined) {
        setTurns((prev) => [...prev, ...prepareAgentTurns(result.events!)]);
        return;
      }

      if (result.payment?.status === "authorized") {
        const merchant = pendingOffer.merchantName;
        setPendingOffer(null);
        setTurns((prev) => [
          ...prev,
          {
            id: `${Date.now()}-pay`,
            role: "agent",
            paymentStatus: "authorized",
            paymentMerchant: merchant,
          },
          { id: `${Date.now()}-complete`, role: "agent", divider: "complete" },
        ]);
      } else if (result.payment?.status === "declined") {
        setTurns((prev) => [
          ...prev,
          { id: `${Date.now()}-pay`, role: "agent", paymentStatus: "declined" },
        ]);
      } else if (
        result.payment?.status === "processing" &&
        result.payment.paymentId !== undefined
      ) {
        setTurns((prev) => [
          ...prev,
          {
            id: `${Date.now()}-pay`,
            role: "agent",
            paymentStatus: "processing",
          },
        ]);
        const paymentId = result.payment.paymentId;
        const polledStatus = await pollUntilTerminal(sessionId, paymentId);
        const finalStatus =
          polledStatus === "authorized"
            ? "authorized"
            : polledStatus === "declined"
              ? "declined"
              : "processing";
        const merchant = pendingOffer.merchantName;
        setPendingOffer(null);
        setTurns((prev) => [
          ...prev,
          {
            id: `${Date.now()}-pay2`,
            role: "agent",
            paymentStatus: finalStatus,
            paymentMerchant: merchant,
          },
          ...(finalStatus === "authorized"
            ? [
                {
                  id: `${Date.now()}-complete`,
                  role: "agent" as const,
                  divider: "complete" as const,
                },
              ]
            : []),
        ]);
      }
    } finally {
      setConfirming(false);
    }
  }

  async function handleIntentEdit(field: string) {
    if (sessionId === undefined || sending) return;
    setSending(true);
    try {
      const response = await editIntent(sessionId, field);
      const newTurns = prepareAgentTurns(response.events);
      setTurns((previous) => [...previous, ...newTurns]);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "That intent field could not be edited.";
      setTurns((previous) => [
        ...previous,
        {
          id: `${Date.now()}-edit-error`,
          role: "agent",
          text: message,
          error: true,
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="mx-auto flex h-dvh max-w-2xl flex-col bg-gradient-to-b from-white to-[var(--canvas)] shadow-[0_0_60px_rgba(23,38,75,0.06)]">
      <AppHeader />
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4">
        <div className="mt-auto flex flex-col">
        {turns.length === 0 ? (
          <WelcomeMessage onPickExample={(text) => void handleSend(text)} />
        ) : null}
        <div className="flex flex-col gap-3">
          {turns.map((turn) => {
            if (turn.chips !== undefined) {
              return (
                <IntentChipRow
                  key={turn.id}
                  chips={turn.chips}
                  onEdit={(field) => void handleIntentEdit(field)}
                />
              );
            }
            if (turn.cards !== undefined) {
              return (
                <DirectionCards
                  key={turn.id}
                  cards={turn.cards}
                  onSelect={(name) => void handleSend(name)}
                />
              );
            }
            if (turn.provisionalItems !== undefined) {
              return (
                <ProvisionalShortlist
                  key={turn.id}
                  items={turn.provisionalItems}
                />
              );
            }
            if (turn.comparison !== undefined) {
              return (
                <ComparisonView
                  key={turn.id}
                  winner={turn.comparison.winner}
                  alternatives={turn.comparison.alternatives}
                />
              );
            }
            if (turn.preview !== undefined) {
              return (
                <TransactionPreview
                  key={turn.id}
                  offer={turn.preview.offer}
                  priceChanged={turn.preview.priceChanged}
                  onConfirm={() => void handleConfirm()}
                  confirming={confirming}
                />
              );
            }
            if (turn.paymentStatus !== undefined) {
              return (
                <PaymentResultView
                  key={turn.id}
                  status={turn.paymentStatus}
                  merchant={turn.paymentMerchant}
                />
              );
            }
            if (turn.divider !== undefined) {
              return <ConversationDivider key={turn.id} kind={turn.divider} />;
            }
            if (turn.status !== undefined) {
              return <SearchingStatus key={turn.id} text={turn.status} />;
            }
            if (turn.text !== undefined) {
              return (
                <ChatBubble key={turn.id} role={turn.role} error={turn.error}>
                  {turn.text}
                </ChatBubble>
              );
            }
            return null;
          })}
          {sending ? <SearchingStatus text="Thinking…" /> : null}
          <div ref={messagesEndRef} />
        </div>
        </div>
      </div>

      <div className="relative border-t border-[var(--line)] bg-[var(--surface)] px-4 py-3 shadow-[0_-8px_24px_rgba(18,20,28,0.05)]">
        {showSlashMenu && filteredCommands.length > 0 ? (
          <div className="absolute bottom-full left-4 mb-2 w-64 overflow-hidden rounded-[14px] border border-[var(--line)] bg-[var(--surface)] shadow-[0_16px_36px_rgba(23,38,75,0.14)]">
            {filteredCommands.map((c) => (
              <button
                key={c.command}
                type="button"
                onClick={() => setInput(`${c.command} `)}
                className="block w-full px-3 py-2 text-left text-[13px] hover:bg-[var(--blue-pale)]"
              >
                <span className="font-medium text-[var(--ink)]">
                  {c.command}
                </span>{" "}
                <span className="text-[var(--muted)]">{c.hint}</span>
              </button>
            ))}
          </div>
        ) : null}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSend(input);
          }}
          className="flex items-center gap-2"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setInput("");
            }}
            placeholder="Message"
            className="flex-1 rounded-[14px] border border-[var(--line)] px-4 py-2.5 text-[15px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--navy)]"
          />
          <button
            type="submit"
            disabled={sending}
            className="rounded-[14px] bg-[var(--navy)] px-4 py-2.5 text-[14px] font-medium text-white shadow-[0_4px_12px_rgba(29,43,83,0.25)] transition hover:bg-[var(--navy-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--navy)] focus-visible:ring-offset-2 disabled:opacity-60 disabled:shadow-none"
          >
            Send
          </button>
        </form>
      </div>
    </main>
  );
}
