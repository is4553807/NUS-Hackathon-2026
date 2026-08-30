import { zodTextFormat } from "openai/helpers/zod.js";
import { z } from "zod";

import { agentConfig } from "../config.js";
import type { DemoCategory, DraftUserIntent } from "../domain-types.js";
import { getOpenAiClient } from "../openai-client.js";

const QuestionOutputSchema = z.object({ question: z.string() });

const SYSTEM_PROMPT = `You are the clarification step of a conversational shopping agent. \
The user's intent is missing required information before any merchant can be searched. \
Ask exactly ONE bundled question that would fill in the missing fields. \
If the need is still fuzzy, include a short illustrative suggestion phrased as a possibility \
(e.g. "...are you thinking something like a one-time service, or ongoing support?") — \
this is general knowledge to help the user think, never a claim about real inventory. \
Never phrase it as a fact about what's available. Keep it to one short, plain-language question. \
No "please", no exclamation marks, sentence case.`;

export interface AttributeDiscoveryInput {
  category: DemoCategory;
  missingFields: string[];
  draft: DraftUserIntent;
}

export async function askAttributeDiscoveryQuestion(
  input: AttributeDiscoveryInput,
): Promise<string> {
  const client = getOpenAiClient();
  const response = await client.responses.parse({
    model: agentConfig.openaiModel,
    input: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content:
          `Category: ${input.category}\n` +
          `What the user said so far: ${input.draft.rawQuery}\n` +
          `Missing required fields: ${input.missingFields.join(", ")}`,
      },
    ],
    text: { format: zodTextFormat(QuestionOutputSchema, "clarifying_question") },
  });

  const parsed = response.output_parsed;
  if (parsed === null) throw new Error("Mode 2a question generation returned no output.");
  return parsed.question;
}
