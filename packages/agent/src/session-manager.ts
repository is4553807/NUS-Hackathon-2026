export type AgentSessionState =
  | "collecting_intent"
  | "searching"
  | "comparing_offers"
  | "awaiting_confirmation"
  | "payment_pending"
  | "completed";

export interface SessionManager {
  getState(sessionId: string): Promise<AgentSessionState>;
  setState(sessionId: string, state: AgentSessionState): Promise<void>;
}
