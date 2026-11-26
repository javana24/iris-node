import { createProviders } from "../lib/infrastructure/llm-router.js";
import { setCorsHeaders } from "../lib/interfaces/http.js";

// Comprueba de verdad cada proveedor de IA (sin gastar tokens).
export default async function handler(req, res) {
  setCorsHeaders(res, "GET");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const providers = await Promise.all(
    createProviders().map(async (provider) => {
      if (provider.configError) {
        return { name: provider.name, ok: false, configured: false, error: provider.configError };
      }
      try {
        await provider.check();
        return { name: provider.name, ok: true, configured: true, model: provider.model };
      } catch (error) {
        return {
          name: provider.name,
          ok: false,
          configured: true,
          model: provider.model,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    })
  );

  const ok = providers.some((provider) => provider.ok);
  return res.status(ok ? 200 : 503).json({ ok, providers });
}
