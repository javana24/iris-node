import { createChatResponse } from "../lib/application/create-chat-response.js";
import { validateAndNormalizeChatRequest } from "../lib/domain/chat-contract.js";
import { CHAT_RATE_LIMITS, createJsonEndpoint } from "../lib/interfaces/http.js";

export default createJsonEndpoint({
  name: "Chat",
  method: "POST",
  rateLimits: CHAT_RATE_LIMITS,
  validate: validateAndNormalizeChatRequest,
  handle: (request) => createChatResponse(request)
});
