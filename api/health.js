import { createProviders } from "../lib/infrastructure/llm-router.js";
import { setCorsHeaders } from "../lib/interfaces/http.js";

// Comprueba cada proveedor de IA. Por defecto sin gastar tokens; con ?deep=1 hace además
// una generación mínima en JSON para detectar fallos que la comprobación ligera no ve.
async function checkProvider(provider, deep) {
  if (provider.configError) {
    return { name: provider.name, ok: false, configured: false, error: provider.configError };
  }

  const result = { name: provider.name, configured: true, model: provider.model };
  try {
    await provider.check();
    if (deep) {
      const started = Date.now();
      const output = await provider.generate({
        systemPrompt: 'Responde solo con este JSON: {"ok": true}',
        messages: [{ role: "user", text: "ping" }],
        temperature: 0,
        maxTokens: 20,
        json: true
      });
      result.generation = { ms: Date.now() - started, output: String(output).slice(0, 80) };
      if (provider.lastRateLimit) {
        result.rateLimit = provider.lastRateLimit;
      }
    }
    return { ...result, ok: true };
  } catch (error) {
    return { ...result, ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export default async function handler(req, res) {
  setCorsHeaders(res, "GET");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const deep = new URL(req.url, "http://localhost").searchParams.get("deep") === "1";
  const providers = await Promise.all(createProviders().map((provider) => checkProvider(provider, deep)));

  const ok = providers.some((provider) => provider.ok);
  return res.status(ok ? 200 : 503).json({ ok, providers });
}
