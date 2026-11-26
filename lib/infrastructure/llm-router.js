import { createGroqProvider } from "./groq-client.js";
import { createOllamaProvider } from "./ollama-client.js";

const PROVIDER_FACTORIES = {
  ollama: createOllamaProvider,
  groq: createGroqProvider
};

export function getProviderOrder(env = process.env) {
  const raw = env.AI_PROVIDERS?.trim() || "ollama,groq";
  return raw
    .split(",")
    .map((name) => name.trim().toLowerCase())
    .filter((name, index, list) => PROVIDER_FACTORIES[name] && list.indexOf(name) === index);
}

export function createProviders(env = process.env) {
  return getProviderOrder(env).map((name) => PROVIDER_FACTORIES[name]());
}

export function getConfiguredProviders(providers = createProviders()) {
  return providers.filter((provider) => !provider.configError);
}

/**
 * Prueba cada proveedor en orden. `parse` convierte el texto del modelo en un resultado
 * válido o devuelve null; con null se pasa al siguiente proveedor.
 * Si ninguno da una salida válida pero alguno devolvió texto, se intenta `fallback(texto)`.
 */
export async function generateWithFallback(
  request,
  { parse = (text) => (text ? { text } : null), fallback = null, providers = createProviders(), logger = console } = {}
) {
  const usable = getConfiguredProviders(providers);
  if (usable.length === 0) {
    const error = new Error("No AI provider is configured");
    error.code = "NO_PROVIDER";
    throw error;
  }

  const failures = [];
  let lastRaw = null;

  for (const provider of usable) {
    try {
      const raw = await provider.generate(request);
      const parsed = parse(raw);
      if (parsed) {
        return { ...parsed, provider: provider.name };
      }
      if (raw) {
        lastRaw = { raw, provider: provider.name };
      }
      failures.push(`${provider.name}: unusable output`);
    } catch (error) {
      const message = `${provider.name}: ${error instanceof Error ? error.message : String(error)}`;
      failures.push(message);
      // Se registra aunque otro proveedor responda después, para poder ver fallos silenciosos en los logs.
      logger.warn?.("AI provider failed, trying next", { failure: message });
    }
  }

  logger.warn?.("AI providers failed", { failures });

  if (lastRaw && fallback) {
    const recovered = fallback(lastRaw.raw);
    if (recovered) {
      return { ...recovered, provider: lastRaw.provider };
    }
  }

  const error = new Error(`All AI providers failed: ${failures.join(" | ")}`);
  error.code = "ALL_FAILED";
  throw error;
}
