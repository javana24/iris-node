import { fetchWithTimeout, readPositiveNumber } from "./http.js";

const DEFAULT_MODEL = "llama3.1:latest";
const DEFAULT_TIMEOUT_MS = 25000;
// Modelos con modo de razonamiento que hay que desactivar para que el chat responda rápido.
const THINKING_MODEL_PATTERN = /qwen3|deepseek-r1|magistral/i;

export function getOllamaConfig(env = process.env) {
  return {
    baseUrl: env.OLLAMA_BASE_URL?.trim().replace(/\/+$/, "") || "",
    model: env.OLLAMA_MODEL?.trim() || DEFAULT_MODEL,
    timeoutMs: readPositiveNumber(env.OLLAMA_TIMEOUT_MS, DEFAULT_TIMEOUT_MS)
  };
}

export function getOllamaConfigError(config = getOllamaConfig()) {
  if (!config.baseUrl) {
    return "OLLAMA_BASE_URL is not configured";
  }

  try {
    new URL(config.baseUrl);
  } catch {
    return "OLLAMA_BASE_URL must be a valid URL";
  }

  return null;
}

export function stripThinking(text) {
  return (text || "").replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

export function createOllamaProvider(config = getOllamaConfig()) {
  return {
    name: "ollama",
    model: config.model,
    configError: getOllamaConfigError(config),

    async generate({ systemPrompt, messages, temperature, maxTokens, json }) {
      const body = {
        model: config.model,
        messages: [
          { role: "system", content: systemPrompt },
          ...messages.map((message) => ({ role: message.role, content: message.text }))
        ],
        stream: false,
        keep_alive: "30m",
        options: { temperature, top_p: 0.9, num_predict: maxTokens }
      };

      if (json) {
        body.format = "json";
      }
      if (THINKING_MODEL_PATTERN.test(config.model)) {
        body.think = false;
      }

      const response = await fetchWithTimeout(
        `${config.baseUrl}/api/chat`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        },
        config.timeoutMs
      );

      if (!response.ok) {
        const detail = (await response.text()).slice(0, 300);
        throw new Error(`Ollama ${response.status}: ${detail}`);
      }

      const data = await response.json();
      return stripThinking(data.message?.content);
    },

    async check() {
      const response = await fetchWithTimeout(`${config.baseUrl}/api/tags`, { method: "GET" }, 6000);
      if (!response.ok) {
        throw new Error(`Ollama ${response.status}`);
      }
      const data = await response.json();
      const models = (data.models || []).map((model) => model.name);
      if (!models.includes(config.model)) {
        throw new Error(`Model ${config.model} not installed (available: ${models.join(", ") || "none"})`);
      }
      return { models };
    }
  };
}
