import { buildAnalysisSystemPrompt, buildAnalysisUserMessage } from "../domain/chat-prompts.js";
import { prepareHistory } from "../domain/chat-contract.js";
import { asStringList, cleanText, extractJsonObject } from "../domain/json-output.js";
import { tacticLabel } from "../domain/tactics.js";
import { generateWithFallback } from "../infrastructure/llm-router.js";

const MAX_ANALYZED_MESSAGES = 40;

function clampScore(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(0, Math.min(100, Math.round(number)));
}

export function parseAnalysisOutput(raw, { language }) {
  const data = extractJsonObject(raw);
  const score = clampScore(data?.score);
  const summary = cleanText(data?.summary, 600);
  if (score === null || !summary) {
    return null;
  }

  const tacticsDetected = (Array.isArray(data.tacticsDetected) ? data.tacticsDetected : [])
    .map((item) => {
      const tactic = typeof item?.tactic === "string" ? item.tactic.trim().toLowerCase().replace(/\s+/g, "_") : "";
      const label = tacticLabel(tactic, language);
      return label ? { tactic, label, example: cleanText(item.example, 240) } : null;
    })
    .filter(Boolean)
    .slice(0, 4);

  const betterResponses = (Array.isArray(data.betterResponses) ? data.betterResponses : [])
    .map((item) => ({
      partnerMessage: cleanText(item?.partnerMessage, 240),
      suggestion: cleanText(item?.suggestion, 300)
    }))
    .filter((item) => item.partnerMessage && item.suggestion)
    .slice(0, 4);

  return {
    score,
    summary,
    strengths: asStringList(data.strengths, { max: 4 }),
    improvements: asStringList(data.improvements, { max: 4 }),
    tacticsDetected,
    betterResponses
  };
}

export async function createConversationAnalysis(request, { generate = generateWithFallback } = {}) {
  const { messages, language, difficulty } = request;
  const history = prepareHistory(messages, MAX_ANALYZED_MESSAGES);

  return generate(
    {
      systemPrompt: buildAnalysisSystemPrompt({ language }),
      messages: [{ role: "user", text: buildAnalysisUserMessage({ messages: history, language, difficulty }) }],
      temperature: 0.3,
      maxTokens: 900,
      json: true
    },
    { parse: (raw) => parseAnalysisOutput(raw, { language }) }
  );
}
