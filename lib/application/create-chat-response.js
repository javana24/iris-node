import { buildChatSystemPrompt } from "../domain/chat-prompts.js";
import { prepareHistory } from "../domain/chat-contract.js";
import { cleanText, extractJsonObject, recoverPlainReply } from "../domain/json-output.js";
import {
  buildOutOfCharacterReply,
  buildSafetyMessage,
  detectHighRisk,
  lastUserMessage
} from "../domain/safety-policy.js";
import { tacticLabel } from "../domain/tactics.js";
import { selectInstituteContext } from "../infrastructure/institute-content.js";
import { generateWithFallback } from "../infrastructure/llm-router.js";

const HISTORY_LIMIT = 20;
const RISK_LEVELS = new Set(["none", "concern", "urgent"]);

const GENERATION_SETTINGS = {
  iris: { temperature: 0.6, maxTokens: 450 },
  partner: { temperature: 0.85, maxTokens: 260 }
};

function normalizeRedFlags(value, language) {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set();
  return value
    .map((flag) => {
      const tactic = typeof flag?.tactic === "string" ? flag.tactic.trim().toLowerCase().replace(/\s+/g, "_") : "";
      const label = tacticLabel(tactic, language);
      const explanation = cleanText(flag?.explanation, 280);
      if (!label || !explanation || seen.has(tactic)) {
        return null;
      }
      seen.add(tactic);
      return { tactic, label, explanation };
    })
    .filter(Boolean)
    .slice(0, 3);
}

export function parseChatOutput(raw, { simulatorMode, language }) {
  const data = extractJsonObject(raw);
  const reply = cleanText(data?.reply);
  if (!reply) {
    return null;
  }

  if (simulatorMode === "partner") {
    return {
      response: reply,
      redFlags: data.outOfCharacter === true ? [] : normalizeRedFlags(data.redFlags, language),
      riskLevel: data.outOfCharacter === true ? "urgent" : "none"
    };
  }

  const risk = typeof data.risk === "string" ? data.risk.trim().toLowerCase() : "none";
  return { response: reply, redFlags: [], riskLevel: RISK_LEVELS.has(risk) ? risk : "none" };
}

function recoverChatOutput(raw) {
  const reply = recoverPlainReply(raw);
  return reply ? { response: reply, redFlags: [], riskLevel: "none" } : null;
}

export async function createChatResponse(request, { generate = generateWithFallback, instituteContext } = {}) {
  const { messages, language, simulatorMode, difficulty } = request;
  const lastUserText = lastUserMessage(messages);
  const highRisk = detectHighRisk(lastUserText);

  // En el simulador, si la persona expresa un peligro real, salimos del personaje sin llamar al modelo.
  if (simulatorMode === "partner" && highRisk) {
    return {
      response: buildOutOfCharacterReply(language),
      redFlags: [],
      riskLevel: "urgent",
      safetyAlert: true,
      safetyMessage: buildSafetyMessage(language),
      provider: "safety-policy"
    };
  }

  const history = prepareHistory(messages, HISTORY_LIMIT);
  const context =
    instituteContext ?? (language === "es" ? selectInstituteContext({ simulatorMode, messages: history }) : "");
  const systemPrompt = buildChatSystemPrompt({ simulatorMode, language, difficulty, instituteContext: context });
  const settings = GENERATION_SETTINGS[simulatorMode] || GENERATION_SETTINGS.iris;

  const result = await generate(
    { systemPrompt, messages: history, temperature: settings.temperature, maxTokens: settings.maxTokens, json: true },
    {
      parse: (raw) => parseChatOutput(raw, { simulatorMode, language }),
      fallback: recoverChatOutput
    }
  );

  const riskLevel = highRisk ? "urgent" : result.riskLevel;
  const safetyAlert = riskLevel === "urgent";

  return {
    response: result.response,
    redFlags: result.redFlags,
    riskLevel,
    ...(safetyAlert && { safetyAlert: true, safetyMessage: buildSafetyMessage(language) }),
    provider: result.provider
  };
}
