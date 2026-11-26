import { fetchWithTimeout, readPositiveNumber } from "./http.js";

const DEFAULT_BASE_URL = "https://api.groq.com/openai/v1";
// llama-3.3-70b-versatile se retiró el 16/08/2026; Groq recomienda gpt-oss-120b como sustituto.
const DEFAULT_MODEL = "openai/gpt-oss-120b";
const DEFAULT_TIMEOUT_MS = 20000;
// Los modelos gpt-oss razonan antes de responder y esos tokens cuentan en el límite:
// se razona lo mínimo y se reserva margen para que quede sitio para la respuesta.
const REASONING_MODEL_PATTERN = /gpt-oss/i;
const REASONING_TOKEN_BUDGET = 400;
const MAX_RETRY_WAIT_SECONDS = 3;

function readRateLimit(headers) {
  const pick = (name) => headers.get(`x-ratelimit-${name}`);
  return {
    limitRequests: pick("limit-requests"),
    remainingRequests: pick("remaining-requests"),
    limitTokens: pick("limit-tokens"),
    remainingTokens: pick("remaining-tokens"),
    resetTokens: pick("reset-tokens")
  };
}

export function getGroqConfig(env = process.env) {
  return {
    apiKey: env.GROQ_API_KEY?.trim() || "",
    baseUrl: env.GROQ_BASE_URL?.trim().replace(/\/+$/, "") || DEFAULT_BASE_URL,
    model: env.GROQ_MODEL?.trim() || DEFAULT_MODEL,
    timeoutMs: readPositiveNumber(env.GROQ_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
    reasoningEffort: env.GROQ_REASONING_EFFORT?.trim() || "low"
  };
}

export function createGroqProvider(config = getGroqConfig()) {
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${config.apiKey}`
  };

  return {
    name: "groq",
    model: config.model,
    configError: config.apiKey ? null : "GROQ_API_KEY is not configured",

    async generate({ systemPrompt, messages, temperature, maxTokens, json }) {
      const body = {
        model: config.model,
        messages: [
          { role: "system", content: systemPrompt },
          ...messages.map((message) => ({ role: message.role, content: message.text }))
        ],
        temperature,
        top_p: 0.9,
        max_tokens: maxTokens
      };

      if (json) {
        body.response_format = { type: "json_object" };
      }
      if (REASONING_MODEL_PATTERN.test(config.model)) {
        body.reasoning_effort = config.reasoningEffort;
        body.max_tokens = maxTokens + REASONING_TOKEN_BUDGET;
      }

      const send = () =>
        fetchWithTimeout(`${config.baseUrl}/chat/completions`, { method: "POST", headers, body: JSON.stringify(body) }, config.timeoutMs);

      let response = await send();
      // Límite por minuto del plan gratuito: si Groq pide esperar poco, se reintenta una vez
      // antes de pasar al siguiente proveedor.
      if (response.status === 429) {
        const waitSeconds = Number(response.headers.get("retry-after"));
        if (Number.isFinite(waitSeconds) && waitSeconds > 0 && waitSeconds <= MAX_RETRY_WAIT_SECONDS) {
          await new Promise((resolve) => setTimeout(resolve, waitSeconds * 1000));
          response = await send();
        }
      }

      this.lastRateLimit = readRateLimit(response.headers);

      if (!response.ok) {
        const detail = (await response.text()).slice(0, 300);
        throw new Error(`Groq ${response.status}: ${detail}`);
      }

      const data = await response.json();
      return (data.choices?.[0]?.message?.content || "").trim();
    },

    async check() {
      // /models no gasta tokens: solo comprueba que la API key es válida.
      const response = await fetchWithTimeout(`${config.baseUrl}/models`, { method: "GET", headers }, 6000);
      if (!response.ok) {
        throw new Error(`Groq ${response.status}`);
      }
      return {};
    }
  };
}
