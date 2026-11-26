import { createChatResponse } from "../lib/application/create-chat-response.js";
import { validateAndNormalizeChatRequest } from "../lib/domain/chat-contract.js";
import { createJsonEndpoint } from "../lib/interfaces/http.js";

export default createJsonEndpoint({
  name: "Chat",
  method: "POST",
  validate: validateAndNormalizeChatRequest,
  handle: (request) => createChatResponse(request)
});
