import { createProviders } from "../lib/infrastructure/llm-router.js";
import { isAuthorizedRequest } from "../lib/interfaces/http-auth.js";
import { setCorsHeaders } from "../lib/interfaces/http.js";

// Proveedores de IA configurados, en el orden en que se prueban.
export default function handler(req, res) {
  setCorsHeaders(res, "GET");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  if (!isAuthorizedRequest(req)) return res.status(401).json({ error: "Unauthorized" });

  const providers = createProviders().map((provider) => ({
    provider: provider.name,
    model: provider.model,
    configured: !provider.configError
  }));

  return res.status(200).json({ providers });
}
