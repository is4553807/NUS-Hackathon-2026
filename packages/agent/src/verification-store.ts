import { randomUUID } from "node:crypto";

const VERIFICATION_TTL_MS = 2 * 60 * 1000;

/**
 * Server-side record of a completed identity-verification gesture, keyed by
 * session. Verification is single-use and short-lived: it is consumed the
 * moment a purchase is confirmed (or expires on its own after two minutes),
 * so every purchase requires its own fresh gesture — a recommendation, or an
 * old confirmation, is never treated as standing consent for a new one.
 */
export class VerificationStore {
  private readonly records = new Map<string, { token: string; expiresAt: number }>();

  issue(sessionId: string): { token: string; expiresAt: number } {
    const record = { token: randomUUID(), expiresAt: Date.now() + VERIFICATION_TTL_MS };
    this.records.set(sessionId, record);
    return record;
  }

  isVerified(sessionId: string): boolean {
    const record = this.records.get(sessionId);
    if (record === undefined) return false;
    if (record.expiresAt < Date.now()) {
      this.records.delete(sessionId);
      return false;
    }
    return true;
  }

  /** Consumed once the verified confirm attempt actually runs, so a second confirm needs a new gesture. */
  consume(sessionId: string): void {
    this.records.delete(sessionId);
  }
}

export const verificationStore = new VerificationStore();
