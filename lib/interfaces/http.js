import { isAuthorizedRequest } from "./http-auth.js";
import { checkRateLimit, getClientId } from "./rate-limit.js";

// Límites por IP. Ojo: en un instituto toda la clase comparte una IP pública, así que
// están pensados para un aula de ~30 personas, y aun así frenan scripts que intenten
// agotar la cuota gratuita de la IA para todo el mundo.
export const CHAT_RATE_LIMITS = [
  { limit: 60, windowMs: 60 * 1000 },
  { limit: 600, windowMs: 60 * 60 * 1000 }
];
export const ANALYZE_RATE_LIMITS = [
  { limit: 20, windowMs: 60 * 1000 },
  { limit: 120, windowMs: 60 * 60 * 1000 }
];

export function setCorsHeaders(res, methods) {
  // La app Android nativa no envía Origin, así que se permite cualquier origen.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", `${methods}, OPTIONS`);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

export function sendError(res, status, error, details = []) {
  return res.status(status).json({ error, ...(details.length > 0 && { details }) });
}

export function parseBody(req) {
  if (req.body === undefined || req.body === null) {
    return {};
  }
  if (typeof req.body === "string") {
    return JSON.parse(req.body);
  }
  return req.body;
}

/**
 * Envuelve un endpoint JSON con CORS, método, auth opcional, parseo y validación.
 * `handle(value)` devuelve el cuerpo de la respuesta 200.
 */
export function createJsonEndpoint({ method, validate, handle, name, rateLimits = [] }) {
  return async function handler(req, res) {
    setCorsHeaders(res, method);

    if (req.method === "OPTIONS") {
      return res.status(204).end();
    }
    if (req.method !== method) {
      return sendError(res, 405, "Method not allowed");
    }
    if (!isAuthorizedRequest(req)) {
      return sendError(res, 401, "Unauthorized");
    }

    const clientId = getClientId(req);
    for (const rule of rateLimits) {
      const { allowed, retryAfterSeconds } = checkRateLimit(clientId, { key: name, ...rule });
      if (!allowed) {
        res.setHeader("Retry-After", String(retryAfterSeconds));
        return sendError(res, 429, "Too many requests", [
          { message: `Demasiados mensajes seguidos. Espera ${retryAfterSeconds} s y vuelve a intentarlo.` }
        ]);
      }
    }

    let value;
    if (method === "POST") {
      let body;
      try {
        body = parseBody(req);
      } catch {
        return sendError(res, 400, "Invalid JSON body", [{ message: "Request body must be valid JSON." }]);
      }

      const validation = validate(body);
      if (!validation.ok) {
        return sendError(res, 400, "Invalid request body", validation.details);
      }
      value = validation.value;
    }

    try {
      return res.status(200).json(await handle(value));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`${name} failed`, { message });
      if (error?.code === "NO_PROVIDER") {
        return sendError(res, 503, "AI provider not configured");
      }
      if (error?.code === "ALL_FAILED") {
        return sendError(res, 503, "AI temporarily unavailable");
      }
      return sendError(res, 500, `${name} failed`);
    }
  };
}
