import { timingSafeEqual } from "node:crypto";

// Clave opcional. Desactivada por defecto: la web y la app son públicas y cualquier
// clave embebida en ellas sería visible igualmente.
export function shouldRequireApiKey(env = process.env) {
  return env.IRIS_REQUIRE_API_KEY === "true";
}

export function isAuthorizedRequest(req, env = process.env) {
  if (!shouldRequireApiKey(env)) {
    return true;
  }

  const expected = env.IRIS_API_KEY || "";
  const received = req.headers?.authorization || "";
  if (!expected) {
    // Si se pide clave pero no está configurada, se deniega en lugar de dejarlo abierto.
    return false;
  }

  const a = Buffer.from(received);
  const b = Buffer.from(`Bearer ${expected}`);
  return a.length === b.length && timingSafeEqual(a, b);
}
