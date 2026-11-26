import { createConversationAnalysis } from "../lib/application/create-conversation-analysis.js";
import { validateAndNormalizeChatRequest } from "../lib/domain/chat-contract.js";
import { ANALYZE_RATE_LIMITS, createJsonEndpoint } from "../lib/interfaces/http.js";

// Informe final del simulador de pareja celosa: evalúa las respuestas de la persona usuaria.
export default createJsonEndpoint({
  name: "Analyze",
  method: "POST",
  rateLimits: ANALYZE_RATE_LIMITS,
  validate: (body) => validateAndNormalizeChatRequest({ ...body, simulatorMode: "partner" }),
  handle: (request) => createConversationAnalysis(request)
});
