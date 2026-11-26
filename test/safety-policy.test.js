import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detectHighRisk, lastUserMessage } from "../lib/domain/safety-policy.js";

describe("safety policy", () => {
  const risky = [
    "me quiero morir",
    "Ya no quiero vivir más",
    "he pensado en suicidarme",
    "Mi novio me pegó ayer",
    "mi pareja me pega cuando se enfada",
    "me ha amenazado con matarme",
    "tengo miedo de que me haga daño",
    "estoy en peligro, ayuda",
    "I want to die",
    "he hits me"
  ];

  const safe = [
    "Hola, ¿qué tal?",
    "He quedado con mis amigos y mi familia",
    "Mi pareja es un poco celosa, ¿es normal?",
    "Me siento culpable por no contestar",
    "Guardo la ropa en el armario",
    "Estoy leyendo sobre el control en las relaciones",
    "Me quiero morir de vergüenza jaja",
    "Ese color me pega mucho",
    "Mi madre me va a matar si llego tarde",
    "Tengo una skill nueva",
    "Mándame la ubicación cuando llegues"
  ];

  for (const text of risky) {
    it(`flags: ${text}`, () => assert.equal(detectHighRisk(text), true));
  }

  for (const text of safe) {
    it(`does not flag: ${text}`, () => assert.equal(detectHighRisk(text), false));
  }

  it("only looks at the last user message", () => {
    const messages = [
      { role: "user", text: "me quiero morir" },
      { role: "assistant", text: "Estoy aquí contigo." },
      { role: "user", text: "Gracias, ya estoy mejor" }
    ];
    assert.equal(detectHighRisk(lastUserMessage(messages)), false);
  });
});
