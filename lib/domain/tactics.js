// Catálogo de tácticas de control/manipulación que la pareja simulada puede usar
// y que se devuelven como "banderas rojas" a los clientes.
export const TACTICS = {
  celos: { es: "Celos posesivos", en: "Possessive jealousy" },
  control: { es: "Control", en: "Control" },
  vigilancia: { es: "Vigilancia del móvil o ubicación", en: "Phone or location monitoring" },
  aislamiento: { es: "Aislamiento", en: "Isolation" },
  culpa: { es: "Hacerte sentir culpable", en: "Guilt-tripping" },
  chantaje: { es: "Chantaje emocional", en: "Emotional blackmail" },
  menosprecio: { es: "Menosprecio", en: "Belittling" },
  luz_de_gas: { es: "Luz de gas", en: "Gaslighting" },
  amor_condicional: { es: "Cariño condicionado", en: "Conditional affection" },
  victimismo: { es: "Victimismo", en: "Playing the victim" }
};

export const TACTIC_IDS = Object.keys(TACTICS);

export function tacticLabel(id, language = "es") {
  const tactic = TACTICS[id];
  if (!tactic) return null;
  return language.startsWith("en") ? tactic.en : tactic.es;
}

export function describeTacticsForPrompt(language = "es") {
  return TACTIC_IDS.map((id) => `- ${id}: ${tacticLabel(id, language)}`).join("\n");
}
