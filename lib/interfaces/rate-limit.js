// Límite de peticiones por IP en memoria.
//
// En Vercel cada instancia tiene su propia memoria, así que no es un límite global exacto,
// pero las instancias calientes se reutilizan y frena los abusos típicos (un script que
// manda cientos de peticiones seguidas para agotar la cuota gratuita de la IA).
// Para un límite global, añade además una regla de "Rate Limit" en Vercel → Firewall.

const buckets = new Map();
const MAX_TRACKED_CLIENTS = 5000;

export function getClientId(req) {
  const forwarded = req.headers?.["x-forwarded-for"];
  const first = Array.isArray(forwarded) ? forwarded[0] : String(forwarded || "").split(",")[0];
  return first.trim() || req.headers?.["x-real-ip"] || req.socket?.remoteAddress || "unknown";
}

/**
 * Ventana deslizante: como mucho `limit` peticiones en `windowMs` por cliente y clave.
 * Devuelve { allowed, retryAfterSeconds }.
 */
export function checkRateLimit(clientId, { key = "default", limit, windowMs, now = Date.now() }) {
  const bucketKey = `${key}:${clientId}`;
  const recent = (buckets.get(bucketKey) || []).filter((timestamp) => now - timestamp < windowMs);

  if (recent.length >= limit) {
    buckets.set(bucketKey, recent);
    const retryAfterSeconds = Math.max(1, Math.ceil((windowMs - (now - recent[0])) / 1000));
    return { allowed: false, retryAfterSeconds };
  }

  recent.push(now);
  buckets.set(bucketKey, recent);

  if (buckets.size > MAX_TRACKED_CLIENTS) {
    // Limpieza simple para que la memoria no crezca sin control.
    for (const [storedKey, timestamps] of buckets) {
      if (!timestamps.length || now - timestamps[timestamps.length - 1] >= windowMs) {
        buckets.delete(storedKey);
      }
    }
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

export function resetRateLimits() {
  buckets.clear();
}
