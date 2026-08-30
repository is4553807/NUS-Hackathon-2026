import { randomUUID } from "node:crypto";

import { emptyDraftIntent, type ChatSession } from "./domain-types.js";
import { RequestIdStore } from "./request-id-store.js";

const sessions = new Map<string, ChatSession>();
export const requestIdStore = new RequestIdStore();

export function getOrCreateSession(sessionId: string): ChatSession {
  const existing = sessions.get(sessionId);
  if (existing !== undefined) return existing;
  const created: ChatSession = {
    sessionId,
    state: "collecting_intent",
    draftIntent: emptyDraftIntent(),
    conversationHistory: [],
  };
  sessions.set(sessionId, created);
  return created;
}

export function resetSession(sessionId: string): ChatSession {
  const fresh: ChatSession = {
    sessionId,
    state: "collecting_intent",
    draftIntent: emptyDraftIntent(),
    conversationHistory: [],
  };
  sessions.set(sessionId, fresh);
  return fresh;
}

export function newSessionId(): string {
  return randomUUID();
}
