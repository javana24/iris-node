// Material formativo del instituto (8 documentos troceados) que se añade al prompt
// para que las respuestas se basen en el contenido del proyecto.
// Portado desde el antiguo servidor Express de la web (Iris/server/lib/institute-content.js).
import { readFileSync } from "node:fs";

const CONTENT_URL = new URL("../../data/institute-content.json", import.meta.url);

const MODE_LIMITS = { iris: 1800, partner: 1000 };

const MODE_DOCUMENT_BOOST = {
  iris: { "punto-5": 1.4, "punto-7": 1.3, "punto-1": 1.2, "punto-2": 1.2, "punto-4": 1.3, "punto-9": 1.1 },
  partner: { "punto-4": 2, "punto-2": 1.5 }
};

const CONVERSATION_TOPIC_HINTS = [
  { terms: ["movil", "telefono", "instagram", "whatsapp", "redes", "tiktok"], docs: ["punto-4", "punto-2"] },
  { terms: ["control", "controla", "celos", "celosa", "celoso", "ubicacion"], docs: ["punto-4", "punto-2", "punto-1"] },
  { terms: ["miedo", "amenaza", "chantaje", "manipul"], docs: ["punto-4", "punto-2"] },
  { terms: ["016", "112", "ayuda", "recurso", "telefono"], docs: ["punto-7", "punto-9"] },
  { terms: ["derecho", "denunc", "victima"], docs: ["punto-9"] },
  { terms: ["amiga", "amigo", "ayudar", "como hablar", "decirle"], docs: ["punto-5", "punto-6"] }
];

let cachedDocuments = null;

function loadDocuments() {
  if (cachedDocuments) {
    return cachedDocuments;
  }
  try {
    const payload = JSON.parse(readFileSync(CONTENT_URL, "utf8"));
    cachedDocuments = Array.isArray(payload.documents) ? payload.documents : [];
  } catch (error) {
    console.warn("Institute content not available", { message: error?.message });
    cachedDocuments = [];
  }
  return cachedDocuments;
}

function normalize(text) {
  return (text || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function tokenize(text) {
  return normalize(text)
    .split(/[^a-z0-9ñ]+/)
    .filter((token) => token.length >= 4);
}

function scoreChunk({ chunk, document, mode, conversationTokens, conversationText }) {
  const chunkTokens = new Set(tokenize(chunk));
  let score = 0;

  for (const token of conversationTokens) {
    if (chunkTokens.has(token)) score += 3;
  }
  for (const topic of document.topics || []) {
    for (const token of tokenize(topic)) {
      if (chunkTokens.has(token)) score += 2;
    }
  }
  for (const hint of CONVERSATION_TOPIC_HINTS) {
    if (hint.docs.includes(document.id) && hint.terms.some((term) => conversationText.includes(term))) {
      score += 6;
    }
  }

  return score * (MODE_DOCUMENT_BOOST[mode]?.[document.id] || 1);
}

/**
 * Devuelve el texto de los fragmentos más relevantes para la conversación,
 * o "" si no hay material. Solo hay material en español.
 */
export function selectInstituteContext({ simulatorMode, messages = [], documents = loadDocuments() }) {
  const mode = simulatorMode === "partner" ? "partner" : "iris";
  const maxChars = MODE_LIMITS[mode];
  const recentText = normalize(messages.slice(-6).map((message) => message.text).join(" "));
  const conversationTokens = new Set(tokenize(recentText));

  const ranked = [];
  for (const document of documents) {
    if (!document.modes?.includes(mode)) continue;
    document.chunks.forEach((chunk, index) => {
      ranked.push({
        document,
        index,
        text: chunk,
        score: scoreChunk({ chunk, document, mode, conversationTokens, conversationText: recentText })
      });
    });
  }

  ranked.sort((a, b) => b.score - a.score || a.index - b.index);

  const selected = [];
  const perDocument = new Map();
  let usedChars = 0;

  for (const item of ranked) {
    if (selected.length >= 3) break;
    const count = perDocument.get(item.document.id) || 0;
    if (count >= 1 || usedChars + item.text.length > maxChars) continue;
    selected.push(item);
    perDocument.set(item.document.id, count + 1);
    usedChars += item.text.length;
  }

  return selected.map((item) => `[${item.document.title}]\n${item.text}`).join("\n\n");
}
