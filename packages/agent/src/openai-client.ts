import OpenAI from "openai";

import { agentConfig } from "./config.js";

let client: OpenAI | undefined;

export function getOpenAiClient(): OpenAI {
  client ??= new OpenAI({ apiKey: agentConfig.openaiApiKey });
  return client;
}
