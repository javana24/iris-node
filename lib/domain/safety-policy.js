// Detección determinista de situaciones de riesgo ALTO en el último mensaje de la persona usuaria.
//
// Antes se buscaban ~230 palabras comunes ("amigos", "control", "culpa"...) como subcadenas
// en TODO el historial, incluidos los mensajes de la pareja simulada, así que la alerta
// saltaba en prácticamente todos los mensajes. Ahora:
//   - solo se mira el último mensaje del usuario,
//   - solo frases claras de peligro (agresión, amenazas graves, suicidio/autolesión),
//   - con límites de palabra (no detecta "arma" dentro de "armario"),
//   - y se combina con el nivel de riesgo que devuelve el modelo en el modo consejero.

const HIGH_RISK_PATTERNS = [
  // Suicidio / autolesión (ES)
  /\bsuicid\w*/,
  // "me quiero morir de vergüenza/risa" es una expresión coloquial: se excluye.
  /\b(me quiero|quiero|quisiera|deseo) morir(me)?\b(?! de\b| del\b)/,
  /\bno quiero (seguir )?vivir\b/,
  /\bquitarme la vida\b/,
  /\b(quiero|voy a|pienso en|he pensado en) matarme\b/,
  /\b(hacerme|me hago|me estoy haciendo) dano\b/,
  /\bautolesion\w*/,
  /\b(cortarme|me corto|me he cortado)\b/,
  /\bacabar con todo\b/,
  // Agresión física o sexual (ES)
  /\bme (pego|ha pegado|golpeo|ha golpeado|empujo|ha empujado|agredio|ha agredido|dio una paliza|ha dado una paliza|da palizas)\b/,
  // En presente ("me pega") solo con sujeto cercano: "ese color me pega" no es una agresión.
  /\b(novio|novia|pareja|ex|chico|chica|padre|madre|el|ella)\b.{0,30}\bme (pega|golpea|empuja|agrede)\b/,
  /\bme (ha )?(forzado|forzo|violado|violo|viola)\b/,
  /\bme obliga a (tener sexo|acostarme|hacer cosas sexuales)\b/,
  /\babuso sexual\b/,
  /\bagresion sexual\b/,
  // Amenazas graves y peligro inmediato (ES)
  // Sin "me va a matar" a secas: es muy común como expresión ("mi madre me va a matar").
  /\b(me|nos) (ha amenazado|amenaza|amenazo) con (matarme|matarnos|pegarme|hacerme dano|un cuchillo|una navaja|un arma)\b/,
  /\btengo miedo de que me (mate|pegue|haga dano)\b/,
  /\bestoy en peligro\b/,
  // English
  /\b(kill myself|want to die|end my life|suicid\w*|self[- ]harm|hurt myself|cut myself|end it all)\b/,
  /\b(hits|hit|beats|beat|punched|chokes|choked|raped|rapes) me\b/,
  /\b(threatened|threatens|going) to kill me\b/,
  /\bi am in danger\b|\bi'm in danger\b/
];

export function normalizeText(text) {
  return (text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ");
}

export function lastUserMessage(messages) {
  return [...(messages || [])].reverse().find((message) => message.role === "user")?.text || "";
}

export function detectHighRisk(text) {
  const normalized = normalizeText(text);
  return HIGH_RISK_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function buildSafetyMessage(language) {
  return language?.startsWith("en")
    ? "If you are in danger, call your local emergency number now. In Spain: 112 for emergencies, 016 for gender-violence support (free, 24h) and 024 if you are having thoughts of suicide."
    : "Si estás en peligro, llama al 112. El 016 atiende 24 h, es gratuito y no aparece en la factura (también por WhatsApp: 600 000 016). Si tienes pensamientos de suicidio o de hacerte daño, llama al 024.";
}

/** Respuesta fija para salir del personaje en el simulador cuando hay riesgo real. */
export function buildOutOfCharacterReply(language) {
  return language?.startsWith("en")
    ? "(Stepping out of the simulation) What you just wrote sounds serious, and you matter. If you are in danger right now, call 112. In Spain you can also call 016 (free, 24h) or 024 if you are thinking about hurting yourself. Talking to an adult you trust can help too. Would you like to talk about it with IRIS?"
    : "(Salgo de la simulación) Lo que acabas de escribir suena serio y me importa cómo estás. Si estás en peligro ahora mismo, llama al 112. También tienes el 016 (gratuito, 24 h) y el 024 si piensas en hacerte daño. Contárselo a una persona adulta de confianza también ayuda. ¿Quieres hablarlo con IRIS en la pestaña del consejero?";
}
