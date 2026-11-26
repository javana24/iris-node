// Utilidades para leer la salida JSON de los modelos, que a veces llega con
// bloques ```json, texto alrededor o comillas mal cerradas.

export function extractJsonObject(text) {
  if (typeof text !== "string" || !text.trim()) {
    return null;
  }

  const withoutFences = text.replace(/```(?:json)?/gi, "").trim();
  const start = withoutFences.indexOf("{");
  const end = withoutFences.lastIndexOf("}");
  if (start === -1 || end <= start) {
    return null;
  }

  try {
    const parsed = JSON.parse(withoutFences.slice(start, end + 1));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function cleanText(value, maxLength = 1200) {
  if (typeof value !== "string") {
    return "";
  }
  return value.replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").trim().slice(0, maxLength);
}

export function asStringList(value, { max = 5, maxLength = 300 } = {}) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => cleanText(typeof item === "string" ? item : item?.text, maxLength))
    .filter(Boolean)
    .slice(0, max);
}

/**
 * Cuando el modelo no devuelve JSON válido, intenta rescatar un texto de respuesta
 * usable (sin llaves ni claves JSON a la vista).
 */
export function recoverPlainReply(text) {
  if (typeof text !== "string") {
    return "";
  }

  const replyField = text.match(/"reply"\s*:\s*"((?:[^"\\]|\\.)*)/);
  if (replyField) {
    try {
      return cleanText(JSON.parse(`"${replyField[1]}"`));
    } catch {
      return cleanText(replyField[1].replace(/\\n/g, "\n"));
    }
  }

  if (/^\s*[{[]/.test(text)) {
    return "";
  }

  return cleanText(text.replace(/```(?:json)?/gi, ""));
}
