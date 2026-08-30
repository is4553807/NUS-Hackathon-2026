import { mkdirSync, readFileSync, appendFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export interface ConsentLogEntry {
  timestamp: string;
  sessionId: string;
  event:
    | "recommendation_shown"
    | "identity_verified"
    | "purchase_confirmed"
    | "payment_authorized"
    | "payment_declined";
  details?: Record<string, unknown>;
}

const LOG_PATH = fileURLToPath(
  new URL("../data/consent-log.jsonl", import.meta.url),
);

function ensureLogDir(): void {
  const dir = dirname(LOG_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

/**
 * Append-only audit trail of what was shown, what was tapped, and when —
 * never a database table (no Postgres access from this layer for this
 * purpose), just a plain JSONL file so the record survives independent of
 * any in-memory session state.
 */
export function appendConsentLog(entry: Omit<ConsentLogEntry, "timestamp">): void {
  ensureLogDir();
  const line = JSON.stringify({ ...entry, timestamp: new Date().toISOString() });
  appendFileSync(LOG_PATH, `${line}\n`, "utf8");
}

export function readConsentLog(sessionId: string): ConsentLogEntry[] {
  if (!existsSync(LOG_PATH)) return [];
  return readFileSync(LOG_PATH, "utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as ConsentLogEntry)
    .filter((entry) => entry.sessionId === sessionId);
}
