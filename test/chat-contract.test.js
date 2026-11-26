import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  normalizeDifficulty,
  normalizeSimulatorMode,
  prepareHistory,
  validateAndNormalizeChatRequest
} from "../lib/domain/chat-contract.js";

describe("chat contract", () => {
  it("normalizes canonical chat requests", () => {
    const result = validateAndNormalizeChatRequest({
      messages: [{ role: "user", content: "Hola" }],
      language: "ES",
      simulatorMode: true,
      difficulty: "Intensa"
    });

    assert.equal(result.ok, true);
    assert.deepEqual(result.value, {
      messages: [{ role: "user", text: "Hola" }],
      language: "es",
      simulatorMode: "partner",
      difficulty: "intensa"
    });
  });

  it("defaults language, mode and difficulty", () => {
    const result = validateAndNormalizeChatRequest({ message: "¿Qué son los celos sanos?" });
    assert.equal(result.ok, true);
    assert.equal(result.value.language, "es");
    assert.equal(result.value.simulatorMode, "iris");
    assert.equal(result.value.difficulty, "moderada");
  });

  it("maps English language codes", () => {
    const result = validateAndNormalizeChatRequest({ message: "Hi", language: "en-GB" });
    assert.equal(result.value.language, "en");
  });

  it("rejects invalid messages with stable details", () => {
    const result = validateAndNormalizeChatRequest({
      messages: [{ role: "system", text: "" }],
      simulatorMode: "iris"
    });

    assert.equal(result.ok, false);
    assert.equal(result.details.some((detail) => detail.field === "messages.0.role"), true);
    assert.equal(result.details.some((detail) => detail.field === "messages.0.text"), true);
  });

  it("requires at least one user message", () => {
    const result = validateAndNormalizeChatRequest({ messages: [{ role: "assistant", text: "Hola" }] });
    assert.equal(result.ok, false);
  });

  it("maps simulator mode and difficulty values", () => {
    assert.equal(normalizeSimulatorMode("partner"), "partner");
    assert.equal(normalizeSimulatorMode(false), "iris");
    assert.equal(normalizeSimulatorMode("unknown"), null);
    assert.equal(normalizeDifficulty("subtle"), "sutil");
    assert.equal(normalizeDifficulty("difícil"), "intensa");
    assert.equal(normalizeDifficulty(undefined), "moderada");
    assert.equal(normalizeDifficulty("imposible"), null);
  });

  it("merges consecutive messages of the same role and keeps the last ones", () => {
    const history = prepareHistory(
      [
        { role: "assistant", text: "¿Dónde estás?" },
        { role: "user", text: "En casa" },
        { role: "user", text: "¿Por?" },
        { role: "assistant", text: "Por nada" }
      ],
      2
    );
    assert.deepEqual(history, [
      { role: "user", text: "En casa\n¿Por?" },
      { role: "assistant", text: "Por nada" }
    ]);
  });
});
